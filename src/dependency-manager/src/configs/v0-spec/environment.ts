import { Transform } from 'class-transformer/decorators';
import { Dict } from '../../utils/transform';
import { EnvironmentConfig, EnvironmentParameters, EnvironmentVault } from '../environment';
import { ServiceConfig } from '../service';
import { ServiceSpecV1 } from './service';

interface VaultMap {
  [vault_name: string]: {
    type: string;
    host: string;
    description?: string;
    client_token?: string;
    role_id?: string;
    secret_id?: string;
  };
}

interface DnsConfigSpec {
  searches?: string | string[];
}

export class EnvironmentSpecV1 extends EnvironmentConfig {
  __version = '1.0.0';
  protected parameters: EnvironmentParameters = {};
  @Transform(Dict(() => ServiceSpecV1), { toClassOnly: true })
  protected services: { [service_ref: string]: ServiceSpecV1 } = {};
  protected vaults: VaultMap = {};
  protected dns?: DnsConfigSpec;

  getDnsConfig(): DnsConfigSpec {
    return this.dns || {};
  }

  getParameters(): EnvironmentParameters {
    return this.parameters;
  }

  getServices(): { [key: string]: ServiceConfig } {
    return this.services;
  }

  getVaults(): { [key: string]: EnvironmentVault } {
    return this.vaults;
  }
}
