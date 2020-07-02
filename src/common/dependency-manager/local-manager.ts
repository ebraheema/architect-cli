import { AxiosInstance } from 'axios';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import untildify from 'untildify';
import DependencyManager, { DependencyNode, EnvironmentConfig, EnvironmentConfigBuilder } from '../../dependency-manager/src';
import { ComponentConfig } from '../../dependency-manager/src/component-config/base';
import { ComponentConfigBuilder } from '../../dependency-manager/src/component-config/builder';
import DependencyGraph from '../../dependency-manager/src/graph';
import { Dictionary } from '../../dependency-manager/src/utils/dictionary';
import { flattenValidationErrorsWithLineNumbers, ValidationErrors } from '../../dependency-manager/src/utils/errors';
import PortUtil from '../utils/port';

export default class LocalDependencyManager extends DependencyManager {
  api: AxiosInstance;
  config_path: string;
  linked_services: Dictionary<string>;

  protected constructor(api: AxiosInstance, config_path = '', linked_services: Dictionary<string> = {}) {
    super();
    this.api = api;
    this.config_path = config_path || '';
    this.linked_services = linked_services;
  }

  static async create(api: AxiosInstance) {
    return this.createFromPath(api, '');
  }

  static async createFromPath(api: AxiosInstance, env_config_path: string, linked_services: Dictionary<string> = {}): Promise<LocalDependencyManager> {
    const dependency_manager = new LocalDependencyManager(api, env_config_path, linked_services);
    const env_config = dependency_manager.config_path
      ? await EnvironmentConfigBuilder.buildFromPath(dependency_manager.config_path)
      : EnvironmentConfigBuilder.buildFromJSON({});

    await dependency_manager.init(env_config);
    return dependency_manager;
  }

  /**
   * @override
   */
  async getServicePort(starting_port?: number): Promise<number> {
    return PortUtil.getAvailablePort(starting_port);
  }

  async loadLocalService(service_path: string): Promise<void> {
    this.config_path = service_path;

    // TODO: Don't load dependencies?
    const component_config = await ComponentConfigBuilder.buildFromPath(service_path);
    const env_config = EnvironmentConfigBuilder.buildFromJSON({
      components: {
        [component_config.getName()]: `file:${service_path}`,
      },
    });
    await this.init(env_config);
  }

  async loadComponentConfig(initial_config: ComponentConfig) {
    const component_extends = initial_config.getExtends();
    const component_name = initial_config.getName();

    if (component_extends && component_extends.startsWith('file:')) {
      return ComponentConfigBuilder.buildFromPath(component_extends.substr('file:'.length));
    } else if (component_name in this.linked_services) {
      initial_config.setExtends(`file:${this.linked_services[component_name]}`);
      // Load locally linked service config
      console.log(`Using locally linked ${chalk.blue(component_name)} found at ${chalk.blue(this.linked_services[component_name])}`);
      return ComponentConfigBuilder.buildFromPath(this.linked_services[component_name]);
    }

    if (component_extends) {
      // Load remote service config
      const [component_name, component_tag] = component_extends.split(':');
      const [account_prefix, component_suffix] = component_name.split('/');
      const { data: component_version } = await this.api.get(`/accounts/${account_prefix}/components/${component_suffix}/versions/${component_tag}`).catch((err) => {
        err.message = `Could not download component for ${component_extends}\n${err.message}`;
        throw err;
      });

      const config = ComponentConfigBuilder.buildFromJSONCompat(component_version.config);
      /*
      if (!config.getImage()) {
        config.setImage(component_version.service.url.replace(/(^\w+:|^)\/\//, ''));
        config.setDigest(component_version.digest);
      }
      */
      return config;
    } else {
      return ComponentConfigBuilder.buildFromJSON(initial_config);
    }
  }

  readIfFile(any_or_path: any): any {
    if (any_or_path && any_or_path.startsWith && any_or_path.startsWith('file:')) {
      const file_path = untildify(any_or_path.slice('file:'.length));
      const res = fs.readFileSync(path.resolve(path.dirname(this.config_path), file_path), 'utf-8');
      return res.trim();
    } else {
      return any_or_path;
    }
  }

  validateComponent(component: ComponentConfig, context: object) {
    const errors = super.validateComponent(component, context);
    const component_extends = component.getExtends();
    if (component_extends?.startsWith('file:') && errors.length) {
      const component_path = component_extends.substr('file:'.length);
      const [file_path, file_contents] = ComponentConfigBuilder.readFromPath(component_path);
      throw new ValidationErrors(file_path, flattenValidationErrorsWithLineNumbers(errors, file_contents.toString()));
    }
    return errors;
  }

  validateEnvironment(environment: EnvironmentConfig, enriched_environment: EnvironmentConfig) {
    const errors = super.validateEnvironment(environment, enriched_environment);
    if (this.config_path && errors.length) {
      const file_contents = fs.readFileSync(this.config_path);
      throw new ValidationErrors(this.config_path, flattenValidationErrorsWithLineNumbers(errors, file_contents.toString()));
    }
    return errors;
  }

  async interpolateEnvironment(graph: DependencyGraph, environment: EnvironmentConfig, component_map: Dictionary<ComponentConfig>) {
    // Only include in cli since it will read files off disk
    for (const vault of Object.values(environment.getVaults())) {
      vault.client_token = this.readIfFile(vault.client_token);
      vault.role_id = this.readIfFile(vault.role_id);
      vault.secret_id = this.readIfFile(vault.secret_id);
    }
    for (const component of Object.values(environment.getComponents()) as Array<ComponentConfig>) {
      for (const pv of Object.values(component.getParameters())) {
        if (pv?.default) pv.default = this.readIfFile(pv.default);
      }
    }
    return super.interpolateEnvironment(graph, environment, component_map);
  }

  toExternalHost() {
    return 'localhost';
  }

  toExternalProtocol() {
    return 'http';
  }

  toInternalHost(node: DependencyNode) {
    return node.normalized_ref;
  }

  async loadComponents(graph: DependencyGraph) {
    const components_map = await super.loadComponents(graph);
    for (const component of Object.values(components_map)) {
      for (const [sk, sv] of Object.entries(component.getServices())) {
        // If debug is enabled merge in debug options ex. debug.command -> command
        const debug_options = sv.getDebugOptions();
        if (debug_options) {
          component.getServices()[sk] = sv.merge(debug_options);
        }
      }
    }
    return components_map;
  }
}
