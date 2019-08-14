import execa from 'execa';
import DeploymentServiceConfig, {ConfigConstructorProps} from './service-config';
import {AppConfig} from '../../app-config';
import {EnvironmentMetadata} from '../environment-metadata';
import ServiceConfig from '../service-config';
import PortUtil from '../port-util';
import url from 'url';

interface DockerConfigConstructorProps extends ConfigConstructorProps {
  image: string;
}

export class DockerDeploymentServiceConfig extends DeploymentServiceConfig {
  static async create(
    app_config: AppConfig,
    environment_metadata: EnvironmentMetadata,
    service_name: string,
    service_version: string,
    _docker_pull_retry = true,
  ): Promise<DockerDeploymentServiceConfig> {
    const repository_name = url.resolve(`${app_config.default_registry_host}/`, `${service_name}:${service_version}`);

    try {
      const { stdout } = await execa('docker', ['inspect', repository_name, '--format', '{{ index .Config.Labels "architect.json"}}']);
      const service_config = ServiceConfig.create(JSON.parse(stdout));
      const env_service_config = environment_metadata.services[service_config.full_name];

      const response = new DockerDeploymentServiceConfig({
        image: repository_name,
        expose_port: env_service_config.port || await PortUtil.getAvailablePort(),
        app_config,
        environment_metadata,
        service_config,
      });

      await response.load_dependencies();
      return response;
    } catch {
      if (_docker_pull_retry) {
        await execa('docker', ['pull', repository_name]);
        return DockerDeploymentServiceConfig.create(app_config, environment_metadata, service_name, service_version, false);
      }
    }

    throw new Error(`Unable to load config for ${service_name}:${service_version}`);
  }

  public image: string;

  constructor(props: DockerConfigConstructorProps) {
    super(props);
    this.image = props.image;
  }
}
