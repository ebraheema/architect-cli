import { plainToClass, Transform, Type, TypeHelpOptions } from 'class-transformer';

/**
 * Used in conjunction with the @Transform annotation from the 'class-transformer'
 * library to create class structures for nested dictionaries.
 */
export const Dict = (typeFunction: any, options?: { key?: string }) =>
  (dict: any) => {
    const classType = typeFunction();
    for (const key of Object.keys(dict)) {
      let value = dict[key];
      if (options && options.key && typeof value === 'string') {
        const new_value: any = {};
        new_value[options.key] = value;
        value = new_value;
      }
      dict[key] = plainToClass(classType, value);
    }
    return dict;
  };

/**
 * Decorator used alongside class transformation to assign default values to fields
 */
export const Default = (defaultValue: any) =>
  Transform((target: any) => target || defaultValue);

interface ConditionalType {
  matches: (value: any) => boolean;
  type: new() => any;
}

/**
 * Conditional type annotation used for properties that map to different
 * types based on their structure
 */
export const ConditionalType = (types: ConditionalType[]) =>
  Type((options?: TypeHelpOptions) => {
    if (options?.object) {
      const value = (options.object as any)[options.property];
      for (const condition of types) {
        if (condition.matches(value)) {
          return condition.type;
        }
      }
    }

    throw new Error(`Field doesn't match any type conditions: ${options?.property}`);
  });
