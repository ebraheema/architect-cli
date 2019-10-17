import fs from 'fs-extra';
import path from 'path';
import { EnvironmentMetadata } from 'src/common/environment-metadata';
import untildify from 'untildify';

export const readIfFile = async (string_or_path: string): Promise<string> => {
  if (string_or_path && string_or_path.startsWith('file:')) {
    const res = await fs.readFile(path.resolve(untildify(string_or_path.slice('file:'.length))), 'utf-8');
    return res.trim();
  } else {
    return string_or_path;
  }
};

export const parseConfig = async (config_file?: string) => {
  let config_json: EnvironmentMetadata = { services: {} };
  if (config_file) {
    config_json = await fs.readJSON(untildify(config_file));
    config_json.services = config_json.services || {};
    for (const service of Object.values(config_json.services)) {
      if (service.parameters) {
        for (const [key, value] of Object.entries(service.parameters)) {
          service.parameters[key] = await readIfFile(value);
        }
      }
      if (service.datastores) {
        for (const datastore of Object.values(service.datastores)) {
          if (datastore.parameters) {
            for (const [key, value] of Object.entries(datastore.parameters)) {
              datastore.parameters[key] = await readIfFile(value);
            }
          }
        }
      }
    }
  }
  return config_json;
};
