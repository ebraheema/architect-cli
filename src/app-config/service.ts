import { AuthenticationClient } from 'auth0';
import axios, { AxiosInstance } from 'axios';
import fs from 'fs-extra';
import path from 'path';
import LoginRequiredError from '../common/errors/login-required';
import { Dictionary } from '../dependency-manager/src/utils/dictionary';
import ARCHITECTPATHS from '../paths';
import AuthClient from './auth';
import AppConfig from './config';

export default class AppService {
  config: AppConfig;
  auth: AuthClient;
  linkedComponents: Dictionary<string> = {};
  _api: AxiosInstance;
  version: string;

  static async create(config_dir: string, version: string): Promise<AppService> {
    const service = new AppService(config_dir, version);
    await service.auth.init();
    return service;
  }

  constructor(config_dir: string, version: string) {
    this.config = new AppConfig(config_dir);
    this.version = version;
    if (config_dir) {
      const config_file = path.join(config_dir, ARCHITECTPATHS.CLI_CONFIG_FILENAME);
      if (fs.existsSync(config_file)) {
        const payload = fs.readJSONSync(config_file);
        this.config = new AppConfig(config_dir, payload);
      }
    }

    this.auth = new AuthClient(this.config, new AuthenticationClient({
      domain: this.config.oauth_domain,
      clientId: AuthClient.CLIENT_ID,
    }));
    this._api = axios.create({
      baseURL: this.config.api_host,
      timeout: 10000,
    });

    const linkedComponentsFile = path.join(config_dir, ARCHITECTPATHS.LINKED_COMPONENT_MAP_FILENAME);
    if (fs.existsSync(linkedComponentsFile)) {
      this.linkedComponents = fs.readJSONSync(linkedComponentsFile) as Dictionary<string>;
    }
  }

  private saveLinkedComponents() {
    const linkedComponentsFile = path.join(this.config.getConfigDir(), ARCHITECTPATHS.LINKED_COMPONENT_MAP_FILENAME);
    fs.writeJSONSync(linkedComponentsFile, this.linkedComponents);
  }

  linkComponentPath(componentName: string, componentPath: string) {
    this.linkedComponents[componentName] = componentPath;
    this.saveLinkedComponents();
  }

  unlinkComponent(componentNameOrPath: string): string | undefined {
    let res;

    if (this.linkedComponents.hasOwnProperty(componentNameOrPath)) {
      delete this.linkedComponents[componentNameOrPath];
      res = componentNameOrPath;
    } else {
      this.linkedComponents = Object.entries(this.linkedComponents).reduce((linkedComponents, [componentName, componentPath]) => {
        if (componentPath !== componentNameOrPath) {
          linkedComponents[componentName] = componentPath;
        } else {
          res = componentName;
        }

        return linkedComponents;
      }, {} as Dictionary<string>);
    }

    this.saveLinkedComponents();
    return res;
  }

  unlinkAllComponents() {
    this.linkedComponents = {};
    this.saveLinkedComponents();
  }

  saveConfig() {
    this.config.save();
  }

  get api(): AxiosInstance {
    if (this.auth.auth_results) {
      const { token_type, access_token } = this.auth.auth_results;
      this._api.defaults.headers = {
        Authorization: `${token_type} ${access_token}`,
        'Cli-Version': this.version,
      };

      const unauthorized_interceptor = this._api.interceptors.response.use(
        res => res,
        async err => {
          if (err?.response?.status === 401) {
            // Don't repeat the 401 check on a loop
            this._api.interceptors.response.eject(unauthorized_interceptor);

            // Attempt a token refresh
            const new_token = await this.auth.refreshToken().catch(() => undefined);
            if (!new_token) {
              // eslint-disable-next-line no-undef
              return Promise.reject(new LoginRequiredError());
            }

            // Retry the last request with the new token
            this._api.defaults.headers = {
              Authorization: `${new_token.token_type} ${new_token.access_token}`,
            };
            const error_config = err.config;
            error_config.headers.Authorization = this._api.defaults.headers.Authorization;
            return this._api.request(error_config);
          }

          throw err;
        }
      );
    }

    return this._api;
  }
}
