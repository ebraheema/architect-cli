export interface EnvironmentMetadata {
  services: { [key: string]: ServiceMetadata };
}

interface ServiceMetadata {
  host?: string;
  port?: number;
  datastores?: { [key: string]: DatastoreMetadata };
  parameters?: { [key: string]: string };
}

interface DatastoreMetadata {
  host?: string;
  port?: number;
  parameters?: { [key: string]: string };
}
