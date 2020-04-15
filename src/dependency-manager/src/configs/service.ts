import { classToClass, plainToClassFromExist } from 'class-transformer';

export interface VaultParameter {
  valueFrom: {
    vault: string;
    key: string;
  };
}

export interface ValueFromParameter {
  valueFrom: {
    dependency: string;
    value: string;
    interface?: string;
  };
}

export interface DatastoreValueFromParameter {
  valueFrom: {
    datastore: string;
    value: string;
  };
}

export type ParameterValue = string | number | ValueFromParameter | VaultParameter | DatastoreValueFromParameter;

interface RestSubscriptionData {
  uri: string;
  headers?: { [key: string]: string };
}

export interface ServiceParameter {
  description: string;
  default?: ParameterValue;
  required: boolean;
  build_arg?: boolean;
}

export interface ServiceDatastore {
  host?: string;
  port?: number;
  image?: string;
  parameters: {
    [key: string]: ServiceParameter;
  };
}

export interface ServiceEventNotifications {
  [notification_name: string]: {
    description: string;
  };
}

export interface ServiceEventSubscriptions {
  [service_ref: string]: {
    [event_name: string]: {
      type: 'rest';
      data: RestSubscriptionData;
    };
  };
}

export interface ServiceApiSpec {
  type: string;
  definitions?: string[];
  liveness_probe?: ServiceLivenessProbe;
}

export interface ServiceInterfaceSpec {
  description?: string;
  host?: string;
  port: number;
}

export interface ServiceLivenessProbe {
  success_threshold?: number;
  failure_threshold?: number;
  timeout?: string;
  path?: string;
  interval?: string;
}

export interface ServiceDebugOptions {
  path?: string;
  dockerfile?: string;
  volumes?: { [s: string]: VolumeSpec };
  command?: string | string[];
  entrypoint?: string | string[];
}

export interface VolumeSpec {
  mount_path?: string;
  host_path?: string;
  description?: string;
  readonly?: boolean;
}

export interface IngressSpec {
  subdomain: string;
}

export abstract class ServiceConfig {
  abstract __version: string;
  abstract getLanguage(): string;
  abstract getImage(): string;
  abstract getCommand(): string | string[];
  abstract setCommand(command: string | string[]): void;
  abstract getEntrypoint(): string | string[];
  abstract setEntrypoint(entrypoint: string | string[]): void;
  abstract getDockerfile(): string | undefined;
  abstract setDockerfile(dockerfile?: string): void;
  abstract getDependencies(): { [s: string]: string };
  abstract getParameters(): { [s: string]: ServiceParameter };
  abstract setParameter(key: string, value: ParameterValue): void;
  abstract getDatastores(): { [s: string]: ServiceDatastore };
  abstract setDatastoreParameter(datastore: string, param_key: string, param_value: ParameterValue): void;
  abstract getApiSpec(): ServiceApiSpec;
  abstract getInterfaces(): { [s: string]: ServiceInterfaceSpec };
  abstract getNotifications(): ServiceEventNotifications;
  abstract getSubscriptions(): ServiceEventSubscriptions;
  abstract getDebugOptions(): ServiceDebugOptions | undefined;
  abstract getPlatforms(): { [s: string]: any };
  abstract addDependency(dependency_name: string, dependency_tag: string): void;
  abstract removeDependency(dependency_name: string): void;
  abstract getPort(): number | undefined;
  abstract getVolumes(): { [s: string]: VolumeSpec };
  abstract setVolume(key: string, volume: VolumeSpec): void;

  getName(): string {
    return '';
  }

  getIngress(): IngressSpec | undefined {
    return undefined;
  }

  getReplicas(): number {
    return 1;
  }

  copy() {
    return classToClass(this);
  }

  merge(other_config: ServiceConfig): ServiceConfig {
    // TODO: merge fails with different debug types
    return plainToClassFromExist(this, other_config);
  }
}
