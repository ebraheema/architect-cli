import {AppConfig} from '../../app-config';
import {EnvironmentMetadata} from '../environment-metadata';
import * as path from 'path';
import ServiceConfig from '../service-config';
import LocalDeploymentServiceConfig from './local-service-config';
import {DockerDeploymentServiceConfig} from './docker-service-config';

export interface ConfigConstructorProps {
  expose_port: number;
  app_config: AppConfig;
  environment_metadata: EnvironmentMetadata;
  service_config: ServiceConfig;
}

export default abstract class DeploymentServiceConfig {
  public expose_port: number;
  public target_port = 8080;
  public params: { [key: string]: string } = {};
  public dependencies: { [name: string]: DeploymentServiceConfig } = {};

  protected _app_config: AppConfig;
  protected _environment_metadata: EnvironmentMetadata;
  protected _service_config: ServiceConfig;

  protected constructor(props: ConfigConstructorProps) {
    this.expose_port = props.expose_port;
    this._app_config = props.app_config;
    this._environment_metadata = props.environment_metadata;
    this._service_config = props.service_config;
  }

  protected async load_dependencies() {
    for (const [name, identifier] of Object.entries(this._service_config.dependencies)) {
      if (identifier.indexOf('file:') === 0) {
        const dependency_path = path.resolve(identifier.slice('file:'.length));
        this.dependencies[name] = await LocalDeploymentServiceConfig.create(
          this._app_config,
          this._environment_metadata,
          dependency_path
        );
      } else {
        this.dependencies[name] = await DockerDeploymentServiceConfig.create(
          this._app_config,
          this._environment_metadata,
          name,
          identifier
        );
      }
    }
  }
}
