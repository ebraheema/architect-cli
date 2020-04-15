/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsNumber, IsNumberString, IsOptional, IsString, ValidateIf, ValidateNested } from 'class-validator';
import { ServiceApiSpec, ServiceConfig, ServiceParameter, VolumeSpec } from '../service';

export const mapToObject = (map?: Map<string, any>, recursive = true) => {
  const res = {} as { [key: string]: any };
  map?.forEach((value, key) => {
    if (recursive && value instanceof Map) {
      value = mapToObject(value);
    }

    res[key] = value;
  });
  return res;
};

class VolumeSpecV1 {
  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  mount_path?: string;

  @IsBoolean()
  @IsOptional()
  readonly?: boolean;
}

class DebugVolumeSpecV1 extends VolumeSpecV1 {
  @IsString()
  @IsOptional()
  host_path?: string;
}

class DebugSpecV1 {
  @IsString()
  @IsOptional()
  dockerfile?: string;

  @IsString()
  @IsOptional()
  command?: string | string[];

  @IsOptional()
  entrypoint?: string | string[];

  @IsOptional()
  @ValidateNested()
  volumes?: Map<string, DebugVolumeSpecV1>;
}

class LivenessProbeSpecV1 {
  @IsNumber()
  @IsOptional()
  success_threshold?: number;

  @IsNumber()
  @IsOptional()
  failure_threshold?: number;

  @IsString()
  @IsOptional()
  timeout?: string;

  @IsString()
  @IsOptional()
  path?: string;

  @IsString()
  @IsOptional()
  interval?: string;
}

class ApiSpecV1 {
  @IsString()
  @IsEnum(['rest'])
  type!: string;

  @IsString({ each: true })
  @IsOptional()
  definitions?: string[];

  @IsOptional()
  @ValidateNested()
  liveness_probe?: LivenessProbeSpecV1;
}

class InterfaceSpecV1 {
  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  port!: number;
}

class NotificationSpecV1 {
  @IsString()
  description!: string;
}

class RestSubscriptionSpecV1 {
  @IsString()
  uri!: string;

  @IsOptional()
  @IsString({ each: true })
  headers?: Map<string, string>;
}

class SubscriptionsSpecV1 {
  @IsString()
  @IsEnum(['rest'])
  type!: 'rest';

  @ValidateNested()
  data!: RestSubscriptionSpecV1;
}

export class ValueFromParameterSpecV1 {
  @ValidateIf(obj => !obj.dependency)
  @IsString()
  datastore?: string;

  @ValidateIf(obj => !obj.datastore)
  @IsString()
  dependency?: string;

  @IsString()
  value!: string;

  @IsString()
  @IsOptional()
  interface?: string;
}

export class VaultValueFromSpecV1 {
  @IsString()
  vault!: string;

  @IsString()
  key!: string;
}

export abstract class SharedServiceSpecV1 extends ServiceConfig {
  @IsString()
  @IsOptional()
  __version = '1.0.0';

  @IsString()
  @IsOptional()
  description?: string;

  @IsString({ each: true })
  @IsOptional()
  keywords?: string[];

  @IsString()
  @IsOptional()
  image?: string;

  @IsString()
  @IsOptional()
  host?: string;

  @IsNumberString()
  @IsOptional()
  port?: string;

  @IsOptional()
  command?: string | string[];

  @IsOptional()
  entrypoint?: string | string[];

  @IsString()
  @IsOptional()
  dockerfile?: string;

  @IsString()
  @IsOptional()
  language?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => DebugSpecV1)
  debug?: string | DebugSpecV1;

  @IsString({ each: true })
  @IsOptional()
  @Type(() => String)
  dependencies?: Map<string, string>;

  @IsOptional()
  @ValidateNested()
  @Type(() => ApiSpecV1)
  api?: ApiSpecV1;

  @IsOptional()
  @ValidateNested()
  @Type(() => InterfaceSpecV1)
  interfaces?: Map<string, InterfaceSpecV1>;

  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationSpecV1)
  notifications?: Map<string, NotificationSpecV1>;

  @IsOptional()
  @ValidateNested()
  @Type(() => SubscriptionsSpecV1)
  subscriptions?: Map<string, Map<string, SubscriptionsSpecV1>>;

  @IsOptional()
  @ValidateNested()
  @Type(() => VolumeSpecV1)
  volumes?: Map<string, VolumeSpecV1>;

  @IsOptional()
  platforms?: Map<string, any>;

  protected static normalizeParameters<T>(
    normalizeFn: (input: T) => ServiceParameter,
    parameters?: Map<string, T>
  ): { [key: string]: ServiceParameter } {
    const res = {} as { [key: string]: ServiceParameter };
    parameters?.forEach((value, key) => {
      res[key] = normalizeFn(value);
    });
    return res;
  }

  getLanguage() {
    return this.language || '';
  }

  getImage() {
    return this.image || '';
  }

  getPort() {
    return this.port ? Number(this.port) : undefined;
  }

  getCommand() {
    return this.command || '';
  }

  setCommand(command: string | string[]) {
    this.command = command;
  }

  getEntrypoint() {
    return this.entrypoint || '';
  }

  setEntrypoint(entrypoint: string | string[]) {
    this.entrypoint = entrypoint;
  }

  getDockerfile() {
    return this.dockerfile;
  }

  setDockerfile(dockerfile?: string) {
    this.dockerfile = dockerfile;
  }

  getDependencies() {
    return mapToObject(this.dependencies);
  }

  addDependency(name: string, tag: string) {
    if (!this.dependencies) {
      this.dependencies = new Map();
    }

    this.dependencies.set(name, tag);
  }

  removeDependency(name: string) {
    this.dependencies?.delete(name);
  }

  getApiSpec(): ServiceApiSpec {
    return this.api || { type: 'rest' };
  }

  getNotifications() {
    return mapToObject(this.notifications);
  }

  getSubscriptions() {
    return mapToObject(this.subscriptions);
  }

  getDebugOptions() {
    switch (typeof this.debug) {
      case 'object':
        return {
          ...this.debug,
          volumes: mapToObject(this.debug.volumes),
        };
      case 'string':
        return { command: this.debug };
      default:
        return this.debug;
    }
  }

  getInterfaces() {
    const _default = this.port ? parseInt(this.port) : 8080;
    const interface_obj = mapToObject(this.interfaces);
    return Object.keys(interface_obj).length ? interface_obj : { _default: { host: this.host, port: _default } };
  }

  getPlatforms(): { [s: string]: any } {
    return mapToObject(this.platforms);
  }

  getVolumes() {
    return mapToObject(this.volumes);
  }

  setVolume(key: string, volume: VolumeSpec) {
    this.volumes?.set(key, volume);
  }
}
