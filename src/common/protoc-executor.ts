import crypto from 'crypto';
import execa from 'execa';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import MANAGED_PATHS from './managed-paths';
import ServiceConfig from './service-config';
import ServiceDependency from './service-dependency';
import SUPPORTED_LANGUAGES from './supported-languages';

namespace ProtocExecutor {
  const _postHooks = async (stub_directory: string, target_language: SUPPORTED_LANGUAGES) => {
    if (target_language === SUPPORTED_LANGUAGES.PYTHON) {
      await fs.writeFile(path.join(stub_directory, '__init__.py'), '');
    }
  };

  // Remove autogenerated code if it is no longer in use
  export const clear = async (target: ServiceDependency) => {
    const service_names = target.dependencies.map(dep => dep.config.name).concat([target.config.name]);
    const service_dirs = new Set(service_names.map(dep => ServiceConfig.convertServiceNameToFolderName(dep)));
    const stubs_directory = path.join(target.service_path, MANAGED_PATHS.DEPENDENCY_STUBS_DIRECTORY);
    if (!await fs.pathExists(stubs_directory)) {
      return;
    }
    for (const dir of await fs.readdir(stubs_directory)) {
      const lstat = await fs.lstat(path.join(stubs_directory, dir));
      if (!lstat.isDirectory()) { continue; }

      const sub_dirs = [];
      const to_remove = [];
      for (const sub_dir of await fs.readdir(path.join(stubs_directory, dir))) {
        const sub_dir_path = path.join(stubs_directory, dir, sub_dir);
        const lstat = await fs.lstat(sub_dir_path);
        if (!lstat.isDirectory()) { continue; }
        sub_dirs.push(sub_dir_path);
        if (!service_dirs.has(path.posix.join(dir, sub_dir))) {
          to_remove.push(sub_dir_path);
        }
      }
      if (sub_dirs.length === 0) {
        if (!service_dirs.has(dir)) {
          await fs.remove(path.join(stubs_directory, dir));
        }
      } else if (sub_dirs.length === to_remove.length) {
        await fs.remove(path.join(stubs_directory, dir));
      } else {
        for (const sub_dir of to_remove) {
          await fs.remove(sub_dir);
        }
      }
    }
  };

  export const execute = async (dependency: ServiceDependency, target: ServiceDependency): Promise<void> => {
    if (!dependency.config.api) {
      throw new Error(`${dependency.config.name} has no api configured.`);
    }
    if (!target.local) {
      throw new Error(`${dependency.config.name} is not a local service`);
    }
    const dependency_folder = ServiceConfig.convertServiceNameToFolderName(dependency.config.name);
    const target_folder = ServiceConfig.convertServiceNameToFolderName(target.config.name);

    // Make the folder to store dependency stubs
    const stub_directory = path.join(target.service_path, MANAGED_PATHS.DEPENDENCY_STUBS_DIRECTORY, dependency_folder);
    await fs.ensureDir(stub_directory);

    const checksums = [];
    for (const definition of dependency.config.api!.definitions) {
      const definition_contents = dependency.api_definitions[definition];
      const hash = crypto.createHash('md5').update(definition_contents).digest('hex');
      checksums.push(hash);
    }

    const checksum_path = path.join(stub_directory, 'checksum');
    const checksum = checksums.join('\n');
    const old_checksum = await fs.readFile(checksum_path, 'utf-8').catch(() => null);
    if (checksum === old_checksum) {
      await fs.writeFile(checksum_path, checksum);
      return;
    }

    const tmp_root = await fs.realpath(os.tmpdir());
    const tmp_dir = path.join(tmp_root, 'architect-grpc', `${dependency_folder}_${target_folder}`);
    const tmp_dependency_dir = path.join(tmp_dir, dependency_folder);
    await fs.ensureDir(tmp_dependency_dir);

    for (const definition of dependency.config.api.definitions) {
      const definition_contents = dependency.api_definitions[definition];
      await fs.writeFile(path.join(tmp_dependency_dir, definition), definition_contents);
    }

    const userInfo = os.userInfo();
    let user_flag: string[] = [];
    // uid/gid are -1 on windows
    if (userInfo.uid >= 0 && userInfo.gid >= 0) {
      user_flag = ['--user', `${userInfo.uid}:${userInfo.gid}`];
    }
    try {
      const cmd_config = [
        'run',
        '--rm', '--init',
        ...user_flag,
        '-v', `${target.service_path}:/defs`,
        '-v', `${tmp_dir}:/protos`,
        'architectio/protoc-all',
        '-i', '/protos',
        '-d', `/protos`,
        '-l', target.config.language,
        '-o', MANAGED_PATHS.DEPENDENCY_STUBS_DIRECTORY,
      ];

      await execa('docker', cmd_config);
      await fs.writeFile(checksum_path, checksum);
    } finally {
      await fs.remove(tmp_dir);
    }

    await _postHooks(stub_directory, target.config.language);
  };
}

export default ProtocExecutor;
