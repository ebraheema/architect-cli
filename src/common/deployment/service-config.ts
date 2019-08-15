import {AppConfig} from '../../app-config';
import {EnvironmentMetadata} from '../environment-metadata';
import * as path from 'path';
import ServiceConfig from '../service-config';
import PortUtil from '../port-util';
import url from 'url';
import execa from 'execa';

interface ConfigConstructorProps {
  name: string;
  target_port?: number;
  expose_port: number;
  parameters: { [key: string]: string | number | null };
  app_config: AppConfig;
  environment_metadata: EnvironmentMetadata;
  service_config: ServiceConfig;
}

interface SubscriberParam {
  [service_name: string]: {
    uri: string;
    headers?: { [key: string]: string };
  };
}

interface ArchitectParam {
  host: string;
  port: number;
  api: string;
  parameters?: { [key: string]: string | number | null };
  datastores?: {
    [datastore_key: string]: object
  };
  subscriptions?: {
    [event_name: string]: SubscriberParam
  };
}

export abstract class DeploymentServiceConfig {
  public name: string;
  public expose_port: number;
  public target_port = 8080;
  public parameters: { [key: string]: string | number | null } = {};
  public dependencies: { [name: string]: DeploymentServiceConfig } = {};
  public service_config: ServiceConfig;

  protected _app_config: AppConfig;
  protected _environment_metadata: EnvironmentMetadata;

  protected constructor(props: ConfigConstructorProps) {
    this.name = props.name;
    this.expose_port = props.expose_port;
    this.service_config = props.service_config;
    this.parameters = props.parameters;
    this._app_config = props.app_config;
    this._environment_metadata = props.environment_metadata;

    if (props.target_port) {
      this.target_port = props.target_port;
    }
  }

  public get normalized_name() {
    return this.name
      .replace(/:/g, '-')
      .replace(/\//g, '--');
  }

  public equals(config: DeploymentServiceConfig): boolean {
    return this.name === config.name;
  }

  public load_subscriptions(peers: DeploymentServiceConfig[]): void {
    for (const service_name of Object.keys(this.service_config.subscriptions)) {
      const dependency_config = peers.find(peer => peer.service_config.name === service_name);
      if (dependency_config) {
        this.dependencies[service_name] = dependency_config;
      }
    }
  }

  public get_environment_variables(peers: DeploymentServiceConfig[]): { [key: string]: string | number | null } {
    if (this.name.includes('.datastore.')) {
      return this.parameters;
    } else {
      let architect_param: { [key: string]: ArchitectParam } = {};
      architect_param[this.service_config.name] = {
        host: this.service_config.api.type === 'grpc'
          ? 'host.docker.internal'
          // tslint:disable-next-line:no-http-string
          : 'http://host.docker.internal',
        port: this.expose_port,
        api: this.service_config.api.type,
        parameters: this.parameters,
        subscriptions: {},
        datastores: Object.keys(this.service_config.datastores).reduce((datastores: { [key: string]: object }, key) => {
          const dep_name = `${this.service_config.full_name}.datastore.${key}`;

          const deployment_config = peers.find(peer => peer.name === dep_name);
          if (!deployment_config) {
            throw new Error(`Failed to load datastore, ${key}, for ${this.service_config.full_name}`);
          }

          datastores[key] = {
            // tslint:disable-next-line:no-http-string
            host: 'host.docker.internal',
            port: deployment_config.expose_port,
            ...deployment_config.parameters
          };
          return datastores;
        }, {}),
      };

      architect_param = Object.values(this.dependencies).reduce((params: { [key: string]: ArchitectParam }, config) => {
        if (!params.hasOwnProperty(config.service_config.name)) {
          params[config.service_config.name] = {
            host: config.service_config.api.type === 'grpc'
              ? 'host.docker.internal'
              // tslint:disable-next-line:no-http-string
              : 'http://host.docker.internal',
            port: config.expose_port,
            api: config.service_config.api.type
          };
        }

        return params;
      }, architect_param);

      return {
        ...this.parameters,
        HOST: this.normalized_name,
        PORT: this.target_port,
        ARCHITECT_CURRENT_SERVICE: this.service_config.name,
        ARCHITECT: JSON.stringify(architect_param),
      };
    }
  }

  public get_flattened_dependencies(): DeploymentServiceConfig[] {
    let res: DeploymentServiceConfig[] = [this];

    for (const dependency_config of Object.values(this.dependencies)) {
      res = dependency_config.get_flattened_dependencies().reduce((all, config) => {
        const exists = all.some(existing => existing.equals(config));

        if (!exists) {
          all.push(config);
        }

        return all;
      }, res);
    }

    return res;
  }

  public async load_dependencies() {
    // Load explicit dependencies
    for (const [name, identifier] of Object.entries(this.service_config.dependencies)) {
      let config;

      if (this instanceof LocalDeploymentServiceConfig && identifier.indexOf('file:') === 0) {
        const dependency_path = path.join(this.build_path, identifier.slice('file:'.length));
        config = await LocalDeploymentServiceConfig.create(
          this._app_config,
          this._environment_metadata,
          dependency_path
        );
      } else {
        config = await DockerDeploymentServiceConfig.create(
          this._app_config,
          this._environment_metadata,
          name,
          identifier
        );
      }

      if (config) {
        this.dependencies[config.name] = config;
      }
    }

    // Load data stores as docker dependencies
    const env_service_config = this._environment_metadata.services[this.service_config.full_name];
    for (const [datastore_key, config] of Object.entries(this.service_config.datastores)) {
      let expose_port = await PortUtil.getAvailablePort();
      let parameters = Object.keys(config.parameters).reduce((params: { [key: string]: string | number | null }, key) => {
        params[key] = config.parameters[key].default!;
        if (config.parameters[key].alias) {
          params[config.parameters[key].alias!] = params[key];
        }

        return params;
      }, {});

      if (env_service_config && env_service_config.datastores && env_service_config.datastores.hasOwnProperty(datastore_key)) {
        const env_datastore_config = env_service_config.datastores[datastore_key];
        if (env_datastore_config) {
          expose_port = env_datastore_config.port || expose_port;

          // Check if host of existing data store was provided
          if (env_datastore_config.host) break;

          if (env_datastore_config.parameters) {
            parameters = Object.keys(env_datastore_config.parameters).reduce((params: { [key: string]: string | number | null }, key) => {
              if (env_datastore_config.parameters && env_datastore_config.parameters.hasOwnProperty(key)) {
                params[key] = env_datastore_config.parameters[key];
                if (config.parameters[key].alias) {
                  params[config.parameters[key].alias!] = params[key];
                }
              }

              return params;
            }, parameters);
          }
        }
      }

      const dep_name = `${this.service_config.full_name}.datastore.${datastore_key}`;
      this.dependencies[dep_name] = new DockerDeploymentServiceConfig({
        name: dep_name,
        image: config.image,
        target_port: config.port,
        expose_port,
        parameters,
        app_config: this._app_config,
        environment_metadata: this._environment_metadata,
        service_config: this.service_config,
      });
    }
  }
}

// ----------------------------------------------------- //
// Docker
// ----------------------------------------------------- //

interface DockerConfigConstructorProps extends ConfigConstructorProps {
  image: string;
}

export class DockerDeploymentServiceConfig extends DeploymentServiceConfig {
  public image: string;

  constructor(props: DockerConfigConstructorProps) {
    super(props);
    this.image = props.image;
  }
}

// ----------------------------------------------------- //
// Local
// ----------------------------------------------------- //

interface LocalConfigConstructorProps extends ConfigConstructorProps {
  command?: string;
  build_path: string;
}

export class LocalDeploymentServiceConfig extends DeploymentServiceConfig {
  public command?: string;
  public build_path: string;

  constructor(props: LocalConfigConstructorProps) {
    super(props);
    this.command = props.command;
    this.build_path = props.build_path;
  }
}
