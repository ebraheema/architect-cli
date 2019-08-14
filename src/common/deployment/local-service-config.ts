import DeploymentServiceConfig, {ConfigConstructorProps} from './service-config';
import ServiceConfig from '../service-config';
import {AppConfig} from '../../app-config';
import {EnvironmentMetadata} from '../environment-metadata';
import PortUtil from '../port-util';

interface LocalConfigConstructorProps extends ConfigConstructorProps {
  command?: string;
  build_path: string;
}

export default class LocalDeploymentServiceConfig extends DeploymentServiceConfig {
  static async create(
    app_config: AppConfig,
    environment_metadata: EnvironmentMetadata,
    service_path: string
  ): Promise<LocalDeploymentServiceConfig> {
    const service_config = ServiceConfig.loadFromPath(service_path);
    const env_service_config = environment_metadata.services[service_config.full_name];

    const response = new LocalDeploymentServiceConfig({
      command: service_config.debug,
      build_path: service_path,
      expose_port: env_service_config.port || await PortUtil.getAvailablePort(),
      app_config,
      environment_metadata,
      service_config,
    });

    await response.load_dependencies();
    return response;
  }

  public command?: string;
  public build_path: string;

  constructor(props: LocalConfigConstructorProps) {
    super(props);
    this.command = props.command;
    this.build_path = props.build_path;
  }
}
