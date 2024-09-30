import { readdirSync, writeFileSync, readFileSync } from 'fs';
import { obfuscate } from 'javascript-obfuscator';


const jsFiles = readdirSync('js').filter(file => file.endsWith('.js'));

for(const file of jsFiles){

    const code = readFileSync(`js/${file}`, 'utf-8');

    const obfuscated = obfuscate(code, {
        identifierNamesGenerator: 'dictionary',
        identifiersDictionary: generateLetterCombinations(),
        compact: true,
        controlFlowFlattening: true
      }).getObfuscatedCode();

    writeFileSync(`public/js/${file}`, obfuscated);

}

function generateLetterCombinations() {
    const letters = 'abcdefghijklmnopqrstuvwxyz';
    const combinations = [];

    for (let i = 0; i < letters.length; i++) {
        combinations.push(letters[i]);
    }

    for (let i = 0; i < letters.length; i++) {
        for (let j = 0; j < letters.length; j++) {
            combinations.push(letters[i] + letters[j]);
        }
    }

    return combinations;
}