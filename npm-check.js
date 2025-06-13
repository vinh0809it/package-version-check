const fs = require('fs');
const csv = require('csv-parser');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const path = require('path');

const inputCsvPath = 'input.csv';
const outputCsvPath = 'npm_release_dates.csv';

function formatDate(dateStr) {
  if (!dateStr) return 'Not found';

  const date = new Date(dateStr);
  if (isNaN(date)) return 'Invalid date';

  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();

  return `${y}/${m}/${d}`;
}

function readInputCSV(filePath) {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => {
        results.push({ lib: data.lib, cur_ver: data.cur_ver });
      })
      .on('end', () => resolve(results))
      .on('error', reject);
  });
}

async function getReleaseDates(pkg) {
  const url = `https://registry.npmjs.org/${pkg.lib}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Request failed`);

    const data = await res.json();
    const time = data.time || {};
    const latest_ver = data['dist-tags']?.latest;

    const curVerDeprecated = data.versions?.[pkg.cur_ver]?.deprecated || '';
    const latestVerDeprecated = data.versions?.[latest_ver]?.deprecated || '';

    const readme = data.readme || '';
    const readmeWarn = /deprecated|no longer maintained|end of life|eol|unmaintained/i.test(readme);

    return {
      lib: pkg.lib,
      cur_ver: pkg.cur_ver,
      cur_ver_date: formatDate(time[pkg.cur_ver]),
      latest_ver,
      latest_ver_date: formatDate(time[latest_ver]),
      deprecated: curVerDeprecated || latestVerDeprecated ? 'Yes' : '',
      readme_flag: readmeWarn ? 'Possible deprecation' : ''
    };
  } catch (e) {
    return {
      lib: pkg.lib,
      cur_ver: pkg.cur_ver,
      cur_ver_date: 'ERROR',
      latest_ver: 'ERROR',
      latest_ver_date: 'ERROR',
      deprecated: 'ERROR',
      readme_flag: 'ERROR'
    };
  }
}

async function writeOutputCSV(records, filePath) {

    let finalPath = filePath;
    let counter = 1;

    const ext = path.extname(filePath); 
    const base = path.basename(filePath, ext);
    const dir = path.dirname(filePath); 

    while (fs.existsSync(finalPath)) {
        finalPath = path.join(dir, `${base}_${counter}${ext}`);
        counter++;
    }

    const csvWriter = createCsvWriter({
        path: finalPath,
        header: [
        { id: 'lib', title: 'lib' },
        { id: 'cur_ver', title: 'cur_ver' },
        { id: 'cur_ver_date', title: 'cur_ver_date' },
        { id: 'latest_ver', title: 'latest_ver' },
        { id: 'latest_ver_date', title: 'latest_ver_date' },
        { id: 'deprecated', title: 'deprecated' },
        { id: 'readme_flag', title: 'readme_flag' }
        ]
    });

    await csvWriter.writeRecords(records);
    console.log(`✅ Output written to ${finalPath}`);
}

(async () => {
  const input = await readInputCSV(inputCsvPath);
  const results = [];

  for (const pkg of input) {
    const info = await getReleaseDates(pkg);
    results.push(info);
  }

  await writeOutputCSV(results, outputCsvPath);
})();