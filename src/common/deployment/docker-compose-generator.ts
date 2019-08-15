import {DeploymentServiceConfig, DockerDeploymentServiceConfig, LocalDeploymentServiceConfig} from './service-config';

interface DockerComposeServiceTemplate {
  ports: string[];
  build?: string;
  image?: string;
  volumes?: string[];
  depends_on: string[];
  environment: { [key: string]: string | number | null };
}

interface DockerComposeTemplate {
  version: '3';
  services: {
    [key: string]: DockerComposeServiceTemplate;
  };
  volumes: {
    [key: string]: any;
  };
}

interface GeneratorProps {
  deployment_configs: DeploymentServiceConfig[];
}

export default class DockerComposeGenerator {
  private _deployment_configs: DeploymentServiceConfig[];

  constructor(props: GeneratorProps) {
    this._deployment_configs = props.deployment_configs;
  }

  public generate(): DockerComposeTemplate {
    this.flatten();
    for (const config of this._deployment_configs) {
      config.load_subscriptions(this._deployment_configs);
    }
    this.flatten();

    return {
      version: '3',
      services: this._deployment_configs.reduce((services: { [key: string]: DockerComposeServiceTemplate}, config) => {
        services[config.normalized_name] = {
          ports: [`${config.expose_port}:${config.target_port}`],
          depends_on: config.name.includes('.datastore.')
            ? []
            : Object.values(config.dependencies).map(dep => dep.normalized_name),
          environment: config.get_environment_variables(this._deployment_configs),
        };

        if (config instanceof LocalDeploymentServiceConfig) {
          services[config.normalized_name].build = config.build_path;
        } else if (config instanceof DockerDeploymentServiceConfig) {
          services[config.normalized_name].image = config.image;
        }

        return services;
      }, {}),
      volumes: {}
    };
  }

  private flatten(): void {
    let new_configs: DeploymentServiceConfig[] = [];

    for (const config of this._deployment_configs) {
      new_configs = config.get_flattened_dependencies().reduce((all, deployment_config) => {
        const exists = all.some(existing => existing.equals(deployment_config));

        if (!exists) {
          all.push(deployment_config);
        }

        return all;
      }, new_configs);
    }

    this._deployment_configs = new_configs;
  }
}
