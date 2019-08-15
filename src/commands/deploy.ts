import { flags } from '@oclif/command';
import execa from 'execa';
import fs from 'fs-extra';
import inquirer from 'inquirer';
import Listr from 'listr';
import os from 'os';
import path from 'path';
import untildify from 'untildify';
import Command from '../base';
import { EnvironmentMetadata } from '../common/environment-metadata';
import MANAGED_PATHS from '../common/managed-paths';
import {DeploymentServiceConfig, LocalDeploymentServiceConfig} from '../common/deployment/service-config';
import DockerComposeGenerator from '../common/deployment/docker-compose-generator';

export default class Deploy extends Command {
  static description = 'Deploy service to environments';

  static flags = {
    help: flags.help({ char: 'h' }),
    deployment_id: flags.string({ exclusive: ['local', 'environment', 'services', 'config_file'] }),
    local: flags.boolean({ char: 'l', exclusive: ['environment', 'deployment_id'] }),
    environment: flags.string({ exclusive: ['local'] }),
    services: flags.string({ char: 's', exclusive: ['environment', 'deployment_id'], multiple: true }),
    config_file: flags.string({ char: 'c', exclusive: ['deployment_id'] })
  };

  async run() {
    const { flags } = this.parse(Deploy);
    if (flags.local) {
      await this.run_local();
    } else {
      await this.run_external();
    }
  }

  async read_parameter(value: string) {
    if (value.startsWith('file:')) {
      return fs.readFile(untildify(value.slice('file:'.length)), 'utf-8');
    } else {
      return value;
    }
  }

  async parse_config(): Promise<EnvironmentMetadata> {
    const { flags } = this.parse(Deploy);
    let config_json: EnvironmentMetadata = { services: {} };
    if (flags.config_file) {
      config_json = await fs.readJSON(untildify(flags.config_file));
      config_json.services = config_json.services || {};
      for (const service of Object.values(config_json.services)) {
        for (const [key, value] of Object.entries(service.parameters || {})) {
          service.parameters![key] = await this.read_parameter(value);
        }
        for (const datastore of Object.values(service.datastores || {})) {
          for (const [key, value] of Object.entries(datastore.parameters || {})) {
            datastore.parameters![key] = await this.read_parameter(value);
          }
        }
      }
    }
    return config_json;
  }

  async run_local() {
    const { flags } = this.parse(Deploy);
    const service_paths = flags.services || [process.cwd()];
    const environment_metadata = await this.parse_config();

    let deployment_configs: DeploymentServiceConfig[] = [];
    for (const svc_path of service_paths) {
      const config = await LocalDeploymentServiceConfig.create(
        this.app_config,
        environment_metadata,
        svc_path
      );

      if (config) {
        deployment_configs.push(config);
      }
    }

    const compose_generator = new DockerComposeGenerator({ deployment_configs });
    const compose_template = compose_generator.generate();

    const docker_compose_path = path.join(os.homedir(), MANAGED_PATHS.HIDDEN, 'docker-compose.json');
    await fs.ensureFile(docker_compose_path);
    await fs.writeFile(docker_compose_path, JSON.stringify(compose_template, null, 2));
    await execa('docker-compose', ['-f', docker_compose_path, 'up', '--build'], { stdio: 'inherit' });
  }

  async run_external() {
    const answers = await this.promptOptions();

    if (answers.deployment_id) {
      await this.deploy(answers.deployment_id);
    } else {
      let deployment: any;
      const tasks = new Listr([
        {
          title: `Planning`,
          task: async () => {
            const config_json = await this.parse_config();
            const data = {
              service: `${answers.service_name}:${answers.service_version}`,
              environment: answers.environment,
              config: config_json
            };
            const { data: res } = await this.architect.post(`/deploy`, { data });
            deployment = res;
          }
        }
      ]);
      await tasks.run();
      this.log('Deployment Id:', deployment.id);

      const confirmation = await inquirer.prompt({
        type: 'confirm',
        name: 'deploy',
        message: 'Would you like to apply this deployment?'
      } as inquirer.Question);

      if (confirmation.deploy) {
        await this.deploy(deployment.id);
      } else {
        this.warn('Canceled deploy');
      }
    }
  }

  async deploy(deployment_id: string) {
    const tasks = new Listr([
      {
        title: `Deploying`,
        task: async () => {
          await this.architect.post(`/deploy/${deployment_id}`);
        }
      }
    ]);
    await tasks.run();
  }

  async promptOptions() {
    const { args, flags } = this.parse(Deploy);

    const [service_name, service_version] = args.service ? args.service.split(':') : [undefined, undefined];
    let options = {
      service_name,
      service_version,
      environment: flags.environment,
      deployment_id: flags.deployment_id
    };

    inquirer.registerPrompt('autocomplete', require('inquirer-autocomplete-prompt'));

    const answers = await inquirer.prompt([{
      type: 'autocomplete',
      name: 'service_name',
      message: 'Select service:',
      source: async (_: any, input: string) => {
        const params = { q: input };
        const { data: services } = await this.architect.get('/services', { params });
        return services.map((service: any) => service.name);
      },
      when: !service_name && !flags.deployment_id
    } as inquirer.Question, {
      type: 'list',
      name: 'service_version',
      message: 'Select version:',
      choices: async (answers_so_far: any) => {
        const { data: service } = await this.architect.get(`/services/${answers_so_far.service_name || service_name}`);
        return service.tags;
      },
      when: !service_version && !flags.deployment_id
    }, {
      type: 'autocomplete',
      name: 'environment',
      message: 'Select environment:',
      source: async (_: any, input: string) => {
        const params = { q: input };
        const { data: environments } = await this.architect.get('/environments', { params });
        return environments.map((environment: any) => environment.name);
      },
      when: !flags.environment
    } as inquirer.Question]);

    return { ...options, ...answers };
  }
}
