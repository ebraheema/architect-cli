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
  export const clear = async (target: ServiceDependency, start: Date) => {
    const stubs_directory = path.join(target.service_path, MANAGED_PATHS.DEPENDENCY_STUBS_DIRECTORY);
    await fs.ensureDir(stubs_directory);
    for (const dir of await fs.readdir(stubs_directory)) {
      const lstat = await fs.lstat(path.join(stubs_directory, dir));
      if (!lstat.isDirectory()) { continue; }
      try {
        const stat = await fs.stat(path.join(stubs_directory, dir, 'checksum'));
        if (stat.mtime < start) {
          await fs.remove(path.join(stubs_directory, dir));
        }
      } catch {
        const sub_dirs = [];
        const to_remove = [];
        for (const sub_dir of await fs.readdir(path.join(stubs_directory, dir))) {
          const sub_dir_path = path.join(stubs_directory, dir, sub_dir);
          const lstat = await fs.lstat(sub_dir_path);
          if (!lstat.isDirectory()) { continue; }
          sub_dirs.push(sub_dir_path);
          try {
            const stat = await fs.stat(path.join(sub_dir_path, 'checksum'));
            if (stat.mtime < start) {
              to_remove.push(sub_dir_path);
            }
          } catch {
            to_remove.push(sub_dir_path);
          }
        }
        if (sub_dirs.length === to_remove.length) {
          await fs.remove(path.join(stubs_directory, dir));
        } else {
          for (const sub_dir of to_remove) {
            await fs.remove(sub_dir);
          }
        }
      }
    }
  };

  export const execute = async (dependency: ServiceDependency, target: ServiceDependency): Promise<void> => {
    if (!dependency.config.interface) {
      throw new Error(`${dependency.config.name} has no interface configured.`);
    }
    if (!target.local) {
      throw new Error(`${dependency.config.name} is not a local service`);
    }
    const dependency_folder = ServiceConfig.convertServiceNameToFolderName(dependency.config.name);

    // Make the folder to store dependency stubs
    const stub_directory = path.join(target.service_path, MANAGED_PATHS.DEPENDENCY_STUBS_DIRECTORY, dependency_folder);
    await fs.ensureDir(stub_directory);

    const checksums = [];
    for (const definition of dependency.config.interface!.definitions) {
      const definition_contents = dependency.interface_definitions[definition];
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
    // Prevent race conditions when building the same service concurrently for different targets
    const tmp_namespace = `${ServiceConfig.convertServiceNameToFolderName(target.config.name)}__${dependency_folder}`;
    const tmp_dir = path.join(tmp_root, tmp_namespace);
    const tmp_dependency_dir = path.join(tmp_dir, dependency_folder);
    await fs.ensureDir(tmp_dependency_dir);

    for (const definition of dependency.config.interface.definitions) {
      const definition_contents = dependency.interface_definitions[definition];
      await fs.writeFile(path.join(tmp_dependency_dir, definition), definition_contents);
    }

    const mount_dirname = '/opt/protoc';
    const mounted_proto_path = path.posix.join(mount_dirname, dependency_folder);

    await execa('docker', [
      'run',
      '--rm', '--init',
      '-v', `${target.service_path}:/defs`,
      '-v', `${tmp_dir}:${mount_dirname}`,
      'architectio/protoc-all',
      '-d', `${mounted_proto_path}`,
      '-i', mount_dirname,
      '-l', target.config.language,
      '-o', MANAGED_PATHS.DEPENDENCY_STUBS_DIRECTORY
    ]);
    await fs.writeFile(checksum_path, checksum);
    await fs.remove(tmp_dir);

    await _postHooks(stub_directory, target.config.language);
  };
};

export default ProtocExecutor;
