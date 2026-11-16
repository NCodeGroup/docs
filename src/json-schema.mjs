// A JSON Schema validator for the keywords schema/site.config.schema.json uses, so that file is the
// one definition of a site configuration: editors read it, and the build checks against it. It is
// not a general validator: an unknown keyword is an error here, so a schema edit that needs more
// than this fails loudly instead of validating nothing.

const ANNOTATIONS = new Set(['$schema', '$id', '$defs', 'title', 'description', 'default', 'examples']);

const typeOf = (value) => (value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value);

/**
 * @param {unknown} value
 * @param {object} schema The root schema.
 * @returns {string[]} One message per problem, each starting with the path of the value it is about.
 */
export function validate(value, schema) {
  const problems = [];
  check(value, schema, schema, '', problems);
  return problems;
}

function resolveRef(ref, root) {
  if (!ref.startsWith('#/')) throw new Error(`Unsupported $ref "${ref}"`);
  let target = root;
  for (const part of ref.slice(2).split('/')) target = target?.[part];
  if (target === undefined) throw new Error(`$ref "${ref}" names nothing`);
  return target;
}

function check(value, schema, root, path, problems) {
  const at = path === '' ? 'the file' : path;
  for (const [keyword, rule] of Object.entries(schema)) {
    if (ANNOTATIONS.has(keyword)) continue;
    switch (keyword) {
      case '$ref':
        check(value, resolveRef(rule, root), root, path, problems);
        break;
      case 'type':
        if (typeOf(value) !== rule) problems.push(`${at} must be ${rule === 'object' || rule === 'array' ? `an ${rule}` : `a ${rule}`}, not ${typeOf(value)}`);
        break;
      case 'enum':
        if (!rule.includes(value)) problems.push(`${at} must be one of ${rule.map((option) => JSON.stringify(option)).join(', ')}`);
        break;
      case 'minLength':
        if (typeof value === 'string' && value.length < rule) problems.push(`${at} must not be empty`);
        break;
      case 'maxLength':
        if (typeof value === 'string' && value.length > rule) problems.push(`${at} must be at most ${rule} characters`);
        break;
      case 'pattern':
        if (typeof value === 'string' && !new RegExp(rule).test(value)) {
          problems.push(`${at} (${JSON.stringify(value)}) does not have the form its description gives${schema.description ? `: ${schema.description}` : ''}`);
        }
        break;
      case 'minItems':
        if (Array.isArray(value) && value.length < rule) problems.push(`${at} must have at least ${rule} ${rule === 1 ? 'entry' : 'entries'}`);
        break;
      case 'items':
        if (Array.isArray(value)) value.forEach((item, index) => check(item, rule, root, `${path}[${index}]`, problems));
        break;
      case 'required':
        if (typeOf(value) === 'object') for (const key of rule) if (!(key in value)) problems.push(`${at} needs "${key}"`);
        break;
      case 'properties':
        if (typeOf(value) === 'object') {
          for (const [key, subschema] of Object.entries(rule)) {
            if (key in value) check(value[key], subschema, root, path === '' ? key : `${path}.${key}`, problems);
          }
        }
        break;
      case 'additionalProperties':
        if (rule !== false) throw new Error('Only additionalProperties: false is supported');
        if (typeOf(value) === 'object') {
          const known = Object.keys(schema.properties ?? {});
          for (const key of Object.keys(value)) {
            if (!known.includes(key)) problems.push(`${at} has an unknown key "${key}" (known: ${known.join(', ')})`);
          }
        }
        break;
      case 'oneOf': {
        // The alternatives here differ by type or by a required key, so the one whose shape the
        // value has is the one to report against.
        const results = rule.map((option) => {
          const found = [];
          check(value, option, root, path, found);
          return found;
        });
        if (!results.some((found) => found.length === 0)) {
          const closest = results.reduce((best, found) => (found.length < best.length ? found : best));
          problems.push(...closest);
        }
        break;
      }
      default:
        throw new Error(`Unsupported JSON Schema keyword "${keyword}"`);
    }
  }
}
