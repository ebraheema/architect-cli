import { flags } from '@oclif/command';
import chalk from 'chalk';
import inquirer from 'inquirer';
import Listr from 'listr';
import Command from '../../../base';

const _info = chalk.blue;

export default class DestroyService extends Command {
  static description = 'Destroy service from an environment';
  static aliases = ['environment:services:destroy'];

  static args = [
    { name: 'service', description: 'Service name', required: false }
  ];

  static flags = {
    help: flags.help({ char: 'h' }),
    environment: flags.string({ description: 'Environment name' }),
    deployment_id: flags.string({ char: 'p' })
  };

  async run() {
    const answers = await this.promptOptions();

    if (answers.deployment_id) {
      await this.deploy(answers.deployment_id);
    } else {
      let deployment: any;
      const tasks = new Listr([
        {
          title: `Planning deletion of service ${_info(answers.service)} from environment ${_info(answers.environment)}`,
          task: async () => {
            const data = { service: answers.service, environment: answers.environment };
            const { data: res } = await this.architect.delete('/deploy', { data });
            deployment = res;
          }
        },
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
    const { args, flags } = this.parse(DestroyService);

    inquirer.registerPrompt('autocomplete', require('inquirer-autocomplete-prompt'));

    const answers: any = await inquirer.prompt([{
      type: 'autocomplete',
      name: 'environment',
      message: 'Select environment:',
      source: async (_: any, input: string) => {
        const params = { q: input };
        const { data: environments } = await this.architect.get('/environments', { params });
        return environments.map((environment: any) => environment.name);
      },
      when: !flags.environment
    } as inquirer.Question, {
      type: 'autocomplete',
      name: 'service',
      message: 'Select service:',
      source: async (answers: any, input: string) => {
        const environment = flags.environment || answers.environment;
        const params = { q: input };
        const { data: services } = await this.architect.get(`/environments/${environment}/services`, { params });
        return services;
      },
      when: !args.service
    } as inquirer.Question, {
      type: 'input',
      name: 'destroy',
      message: 'Are you absolutely sure?\nThis will destroy the service from the environment.\nPlease type in the name of the service to confirm.\n',
      validate: (value, answers) => {
        const service = args.service || answers!.service;
        if (value === service) {
          return true;
        }
        return `Name must match: ${_info(service)}`;
      }
    }]);
    return { ...args, ...flags, ...answers };
  }
}