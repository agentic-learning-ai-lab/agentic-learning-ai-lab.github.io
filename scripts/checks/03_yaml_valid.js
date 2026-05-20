/**
 * Validate every data/*.yaml file parses cleanly. Catches:
 *   - YAML syntax errors (bad indent, unclosed quotes, mismatched braces)
 *   - Tab characters where spaces are required
 *
 * Doesn't enforce schema (separate check). Just "does js-yaml accept it".
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const ROOT = path.resolve(__dirname, '..', '..');
const DATA_DIR = path.join(ROOT, 'data');

module.exports = {
    name: 'yaml-valid',
    run() {
        if (!fs.existsSync(DATA_DIR)) return true;
        const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.yaml'));
        let ok = true;
        for (const f of files) {
            const full = path.join(DATA_DIR, f);
            try {
                yaml.load(fs.readFileSync(full, 'utf8'));
            } catch (err) {
                console.error(`⛔ yaml-valid: data/${f}: ${err.message}`);
                ok = false;
            }
        }
        return ok;
    },
};
