import {AppConfig} from '../../app-config';
import {EnvironmentMetadata} from '../environment-metadata';
import * as path from 'path';
import ServiceConfig from '../service-config';
import PortUtil from '../port-util';
import {DeploymentServiceConfig, DockerDeploymentServiceConfig, LocalDeploymentServiceConfig} from './service-config';
import url from 'url';
import execa from 'execa';

const _load_dependencies = async (deployment_config: DeploymentServiceConfig) => {
  // Load explicit dependencies
  for (const [name, identifier] of Object.entries(deployment_config.service_config.dependencies)) {
    let config;

    if (deployment_config instanceof LocalDeploymentServiceConfig && identifier.indexOf('file:') === 0) {
      const dependency_path = path.join(deployment_config.build_path, identifier.slice('file:'.length));
      config = await build_local(
        deployment_config._app_config,
        deployment_config._environment_metadata,
        dependency_path
      );
    } else {
      config = await build_docker(
        deployment_config._app_config,
        deployment_config._environment_metadata,
        name,
        identifier
      );
    }

    if (config) {
      deployment_config.dependencies[config.name] = config;
    }
  }

  // Load data stores as docker dependencies
  const env_service_config = deployment_config._environment_metadata.services[deployment_config.service_config.full_name];
  for (const [datastore_key, config] of Object.entries(deployment_config.service_config.datastores)) {
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

    const dep_name = `${deployment_config.service_config.full_name}.datastore.${datastore_key}`;
    deployment_config.dependencies[dep_name] = new DockerDeploymentServiceConfig({
      name: dep_name,
      image: config.image,
      target_port: config.port,
      expose_port,
      parameters,
      app_config: deployment_config._app_config,
      environment_metadata: deployment_config._environment_metadata,
      service_config: deployment_config.service_config,
    });
  }
};

export const build_local = async (
  app_config: AppConfig,
  environment_metadata: EnvironmentMetadata,
  service_path: string
): Promise<LocalDeploymentServiceConfig | undefined> => {
  service_path = path.resolve(service_path);
  const service_config = ServiceConfig.loadFromPath(service_path);
  const env_service_config = environment_metadata.services[service_config.full_name];

  // Check if a host was already configured for the service
  if (env_service_config && env_service_config.host) return;

  const parameters = Object.keys(service_config.parameters)
    .reduce((params: { [key: string]: string | number | null }, key) => {
      if (env_service_config && env_service_config.parameters && env_service_config.parameters.hasOwnProperty(key)) {
        params[key] = env_service_config.parameters[key];
      } else {
        params[key] = service_config.parameters[key].default!;
      }

      if (service_config.parameters[key].alias) {
        params[service_config.parameters[key].alias!] = params[key];
      }

      return params;
    }, {});

  const expose_port = env_service_config && env_service_config.port;
  const response = new LocalDeploymentServiceConfig({
    name: service_config.full_name,
    command: service_config.debug,
    build_path: service_path,
    expose_port: expose_port || await PortUtil.getAvailablePort(),
    parameters,
    app_config,
    environment_metadata,
    service_config,
  });

  await _load_dependencies(response);
  return response;
};

const build_docker = async (
  app_config: AppConfig,
  environment_metadata: EnvironmentMetadata,
  service_name: string,
  service_version: string,
  _docker_pull_retry = true,
): Promise<DockerDeploymentServiceConfig | undefined> => {
  const repository_name = url.resolve(`${app_config.default_registry_host}/`, `${service_name}:${service_version}`);

  try {
    const { stdout } = await execa('docker', ['inspect', repository_name, '--format', '{{ index .Config.Labels "architect.json"}}']);
    const service_config = ServiceConfig.create(JSON.parse(stdout));
    const env_service_config = environment_metadata.services[service_config.full_name];

    // Check if a host was already configured for the service
    if (env_service_config.host) return;

    const parameters = Object.keys(service_config.parameters)
      .reduce((params: { [key: string]: string | number | null }, key) => {
        if (env_service_config.parameters && env_service_config.parameters.hasOwnProperty(key)) {
          params[key] = env_service_config.parameters[key];
        } else {
          params[key] = service_config.parameters[key].default!;
        }

        if (service_config.parameters[key].alias) {
          params[service_config.parameters[key].alias!] = params[key];
        }

        return params;
      }, {});

    const response = new DockerDeploymentServiceConfig({
      name: service_config.full_name,
      image: repository_name,
      expose_port: env_service_config.port || await PortUtil.getAvailablePort(),
      parameters,
      app_config,
      environment_metadata,
      service_config,
    });

    await _load_dependencies(response);
    return response;
  } catch {
    if (_docker_pull_retry) {
      await execa('docker', ['pull', repository_name]);
      return build_docker(app_config, environment_metadata, service_name, service_version, false);
    }
  }

  throw new Error(`Unable to load config for ${service_name}:${service_version}`);
};
