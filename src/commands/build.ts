import { flags } from '@oclif/command';
import chalk from 'chalk';
import * as execa from 'execa';
import * as Listr from 'listr';
import * as path from 'path';

import Command from '../base';
import MANAGED_PATHS from '../common/managed-paths';
import ServiceConfig from '../common/service-config';

import Install from './install';

const _info = chalk.blue;
const _error = chalk.red;

export default class Build extends Command {
  static description = `Create an ${MANAGED_PATHS.ARCHITECT_JSON} file for a service`;

  static flags = {
    help: flags.help({ char: 'h' }),
    tag: flags.string({
      char: 't',
      required: false,
      description: 'Name and optionally a tag in the ‘name:tag’ format'
    }),
    recursive: flags.boolean({
      char: 'r',
      default: false,
      description: 'Whether or not to build images for the cited dependencies'
    })
  };

  static args = [
    {
      name: 'context',
      description: 'Path to the service to build'
    }
  ];

  static async getTasks(service_path: string, tag?: string, recursive?: boolean): Promise<Listr.ListrTask[]> {
    const dependencies = await ServiceConfig.getDependencies(service_path, recursive);
    const tasks: Listr.ListrTask[] = [];

    dependencies.forEach(dependency => {
      tasks.push({
        title: `Building docker image for ${_info(dependency.service_config.name)}`,
        task: async () => {
          const install_tasks = await Install.getTasks(dependency.service_path);
          const build_task = {
            title: 'Building',
            task: async () => {
              await Build.buildImage(dependency.service_path, dependency.service_config, tag);
            }
          };
          return new Listr(install_tasks.concat([build_task]));
        }
      });
    });
    return tasks;
  }

  static async buildImage(service_path: string, service_config: ServiceConfig, tag?: string) {
    const dockerfile_path = path.join(__dirname, '../../Dockerfile');
    const tag_name = tag || `architect-${service_config.name}`;

    await execa.shell([
      'docker', 'build',
      '--compress',
      '--build-arg', `SERVICE_LANGUAGE=${service_config.language}`,
      '-t', tag_name,
      '-f', dockerfile_path,
      '--label', `architect.json='${JSON.stringify(service_config)}'`,
      service_path
    ].join(' '));
  }

  async run() {
    const { args, flags } = this.parse(Build);
    if (flags.recursive && flags.tag) {
      this.error(_error('Cannot specify tag for recursive builds'));
    }

    let root_service_path = process.cwd();
    if (args.context) {
      root_service_path = path.resolve(args.context);
    }

    const tasks = new Listr(await Build.getTasks(root_service_path, flags.tag, flags.recursive), { concurrent: 2 });
    await tasks.run();
  }
}
