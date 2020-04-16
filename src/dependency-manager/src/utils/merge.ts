// https://gist.github.com/Salakar/1d7137de9cb8b704e48a#gistcomment-2881879

type Dictionary<T> = { [key: string]: T };
type MapOrDictionary<T> = Map<string, T> | Dictionary<T>;

const isObject = (item: any) =>
  item
  && typeof item === 'object'
  && !Array.isArray(item)
  && item !== null;

const deepMerge = (target: any, source: any) => {
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach(key => {
        if (isObject(source[key])) {
            if (!target[key] || !isObject(target[key])) {
                target[key] = source[key];
            }

            deepMerge(target[key], source[key]);
        } else {
            Object.assign(target, { [key]: source[key] });
        }
    });
  }

  return target;
};

export const mergeMaps = <T>(target: MapOrDictionary<T>, source: MapOrDictionary<T>): Map<string, T> => {
  // Convert to object
  if (target instanceof Map) {
    const newObj = {} as Dictionary<T>;
    target.forEach((value, key) => {
      newObj[key] = value;
    });
    target = newObj;
  }

  if (source instanceof Map) {
    const newObj = {} as Dictionary<T>;
    source.forEach((value, key) => {
      newObj[key] = value;
    });
    source = newObj;
  }

  target = deepMerge(target, source);
  return new Map(Object.entries(target));
};
