import {
  FilePath,
  LegacyManifest,
  Locale,
  LocalizedString,
  Manifest,
  ModDependencies,
  ModDependency,
  ModDependencyDetails,
  ModIcons,
  Person,
  PersonDetails,
} from 'ultimate-crosscode-typedefs/file-types/mod-manifest';

enum Type {
  string = 'string',
  number = 'number',
  boolean = 'boolean',
  array = 'array',
  object = 'object',
  null = 'null',
  unknown = 'unknown',
}

type TypeAssertionResult =
  | { status: 'ok'; type: Type }
  | { status: 'optional' }
  | { status: 'failed' };

function getType(value: unknown): Type {
  // eslint-disable-next-line eqeqeq
  if (value === null) return Type.null;
  if (typeof value === 'string') return Type.string;
  if (typeof value === 'number') return Type.number;
  if (typeof value === 'boolean') return Type.boolean;
  if (Array.isArray(value)) return Type.array;
  if (typeof value === 'object') return Type.object;
  return Type.unknown;
}

// TODO: investigate prototype chain bugs when extending `Error` here
export class ManifestValidationError extends Error {
  public constructor(public problems: string[]) {
    super(`\n${problems.map((p) => `- ${p}`).join('\n')}`);
    this.name = new.target.name;
  }
}

// these paths seem like a valid use-case for linked lists. don't know whether
// this is a real optimization in our case, but I suppose you can try to
// implement that
type JsonPath = Array<string | number>;

function jsonPathToString(path: JsonPath): string {
  if (path.length === 0) return '<document>';

  let str = '';

  for (let i = 0; i < path.length; i++) {
    let key = path[i];
    if (typeof key === 'number') {
      str += `[${key}]`;
    } else if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)) {
      if (i > 0) str += '.';
      str += key;
    } else {
      str += `[${JSON.stringify(key)}]`;
    }
  }

  return str;
}

/* eslint-disable no-undefined */

export class Validator {
  private problems: string[] = [];

  public validate(data: Manifest): void {
    this.problems = [];

    if (this.assertType([], data, [Type.object]).status === 'ok') {
      if (this.assertType(['id'], data.id, [Type.string]).status === 'ok') {
        if (!/^[a-zA-Z0-9_-]+$/.test(data.id)) {
          this.problems.push(
            'id must consist only of one or more alphanumberic characters, hyphens or underscores',
          );
        }
      }

      this.assertType(['version'], data.version, [Type.string], true);

      this.assertLocalizedString(['title'], data.title, true);
      this.assertLocalizedString(['description'], data.description, true);
      this.assertType(['license'], data.license, [Type.string], true);
      this.assertLocalizedString(['homepage'], data.homepage, true);
      this.assertKeywords(['keywords'], data.keywords);
      this.assertModIcons(['icons'], data.icons);

      this.assertPeople(['authors'], data.authors);

      this.assertDependencies(['dependencies'], data.dependencies, false);

      this.assertAssets(['assets'], data.assets);
      this.assertType(['assetsDir'], data.assetsDir, [Type.string], true);
      this.assertType(['modPrefix'], data.modPrefix, [Type.string], true);

      this.assertType(['plugin'], data.plugin, [Type.string], true);
      this.assertType(['preload'], data.preload, [Type.string], true);
      this.assertType(['postload'], data.postload, [Type.string], true);
      this.assertType(['prestart'], data.prestart, [Type.string], true);
      this.assertType(['poststart'], data.poststart, [Type.string], true);
    }

    if (this.problems.length > 0) {
      throw new ManifestValidationError(this.problems);
    }
  }

  public validateLegacy(data: LegacyManifest): void {
    this.problems = [];

    if (this.assertType([], data, [Type.object]).status === 'ok') {
      this.assertType(['name'], data.name, [Type.string]);
      this.assertType(['version'], data.version, [Type.string], true);

      this.assertType(['ccmodHumanName'], data.ccmodHumanName, [Type.string], true);
      this.assertType(['description'], data.description, [Type.string], true);
      this.assertType(['license'], data.license, [Type.string], true);
      this.assertType(['homepage'], data.homepage, [Type.string], true);
      this.assertModIcons(['icons'], data.icons);

      if (data.ccmodDependencies !== undefined) {
        this.assertDependencies(['ccmodDependencies'], data.ccmodDependencies, true);
      } else {
        this.assertDependencies(['dependencies'], data.dependencies, true);
      }

      this.assertAssets(['assets'], data.assets);

      this.assertType(['plugin'], data.plugin, [Type.string], true);
      this.assertType(['preload'], data.preload, [Type.string], true);
      this.assertType(['postload'], data.postload, [Type.string], true);
      this.assertType(['prestart'], data.prestart, [Type.string], true);
      this.assertType(['main'], data.main, [Type.string], true);
    }

    if (this.problems.length > 0) {
      throw new ManifestValidationError(this.problems);
    }
  }

  private assertType(
    valuePath: JsonPath,
    value: unknown,
    expectedTypes: Type[],
    optional = false,
  ): TypeAssertionResult {
    if (value === undefined) {
      if (optional) {
        return { status: 'optional' };
      } else {
        this.problems.push(`'${jsonPathToString(valuePath)}' is required`);
        return { status: 'failed' };
      }
    }

    let actualType = getType(value);
    if (!expectedTypes.includes(actualType)) {
      let valuePathStr = jsonPathToString(valuePath);
      let expectedTypesStr = expectedTypes.join(' or ');
      this.problems.push(
        `expected type of '${valuePathStr}' to be '${expectedTypesStr}', got '${actualType}'`,
      );
      return { status: 'failed' };
    }

    return { status: 'ok', type: actualType };
  }

  private assertLocalizedString(
    valuePath: JsonPath,
    value: LocalizedString | undefined,
    optional = false,
  ): void {
    let assertion = this.assertType(valuePath, value, [Type.object, Type.string], optional);
    if (assertion.status !== 'ok') return;
    value = value!;

    if (assertion.type === Type.string) return;
    for (let [key, value2] of Object.entries(value as Record<Locale, string>)) {
      this.assertType([...valuePath, key], value2, [Type.string]);
    }
  }

  private assertKeywords(valuePath: JsonPath, value: LocalizedString[] | undefined): void {
    let assertion = this.assertType(valuePath, value, [Type.array], true);
    if (assertion.status !== 'ok') return;
    value = value!;

    for (let index = 0; index < value.length; index++) {
      let value2 = value[index];
      this.assertLocalizedString([...valuePath, index], value2);
    }
  }

  private assertPeople(valuePath: JsonPath, value: Person[] | undefined): void {
    let assertion = this.assertType(valuePath, value, [Type.array], true);
    if (assertion.status !== 'ok') return;
    value = value!;

    for (let index = 0; index < value.length; index++) {
      let value2 = value[index];
      this.assertPerson([...valuePath, index], value2);
    }
  }

  private assertPerson(valuePath: JsonPath, value: Person): void {
    let assertion = this.assertType(valuePath, value, [Type.object, Type.string]);
    if (assertion.status !== 'ok') return;

    if (assertion.type === Type.string) return;
    value = value as PersonDetails;

    this.assertLocalizedString([...valuePath, 'name'], value.name);
    this.assertLocalizedString([...valuePath, 'email'], value.email, true);
    this.assertLocalizedString([...valuePath, 'url'], value.url, true);
    this.assertLocalizedString([...valuePath, 'comment'], value.comment, true);
  }

  private assertDependencies(
    valuePath: JsonPath,
    value: ModDependencies | undefined,
    legacy: boolean,
  ): void {
    let assertion = this.assertType(valuePath, value, [Type.object], true);
    if (assertion.status !== 'ok') return;
    value = value!;

    for (let [key, value2] of Object.entries(value)) {
      let valuePath2 = [...valuePath, key];
      if (legacy) this.assertType(valuePath2, value2, [Type.string]);
      else this.assertDependency(valuePath2, value2);
    }
  }

  private assertDependency(valuePath: JsonPath, value: ModDependency): void {
    let assertion = this.assertType(valuePath, value, [Type.object, Type.string]);
    if (assertion.status !== 'ok') return;

    if (assertion.type === Type.string) return;
    value = value as ModDependencyDetails;

    this.assertType([...valuePath, 'version'], value.version, [Type.string]);
    this.assertType([...valuePath, 'optional'], value.optional, [Type.boolean], true);
  }

  private assertAssets(valuePath: JsonPath, value: FilePath[] | undefined): void {
    let assertion = this.assertType(valuePath, value, [Type.array], true);
    if (assertion.status !== 'ok') return;
    value = value!;

    for (let index = 0; index < value.length; index++) {
      let value2 = value[index];
      this.assertType([...valuePath, index], value2, [Type.string]);
    }
  }

  private assertModIcons(valuePath: JsonPath, value: ModIcons | undefined): void {
    let assertion = this.assertType(valuePath, value, [Type.object], true);
    if (assertion.status !== 'ok') return;
    value = value!;

    for (let [key, value2] of Object.entries(value)) {
      this.assertType([...valuePath, key], value2, [Type.string]);
    }
  }
}

export function convertFromLegacy(data: LegacyManifest): Manifest {
  return {
    id: data.name,
    version: data.version,
    license: data.license,

    title: data.ccmodHumanName,
    description: data.description,
    homepage: data.homepage,
    icons: data.icons,

    dependencies: data.ccmodDependencies ?? data.dependencies,

    assets: data.assets?.map((path) => (path.startsWith('assets/') ? path.slice(7) : path)),

    plugin: data.plugin,
    preload: data.preload,
    postload: data.postload,
    prestart: data.prestart,
    poststart: data.main,
  };
}
