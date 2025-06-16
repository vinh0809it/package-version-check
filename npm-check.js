const fs = require('fs');
const csv = require('csv-parser');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const path = require('path');
const cliProgress = require('cli-progress');

const inputCsvPath = 'input.csv';
const outputCsvPath = 'output/npm_release_dates.csv';

const progressBar = new cliProgress.SingleBar({
  format: '⏳ Progress |{bar}| {percentage}% || {value}/{total} done || elapsed: {duration}s',
  barCompleteChar: '█',
  barIncompleteChar: '░',
  hideCursor: true
}, cliProgress.Presets.legacy);

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
    const readmeWarn = /deprecated|no longer maintained|end of life|eol|unmaintained|dropped|removed/i.test(readme);

    return {
      lib: pkg.lib,
      cur_ver: pkg.cur_ver,
      cur_ver_date: formatDate(time[pkg.cur_ver]),
      latest_ver,
      latest_ver_date: formatDate(time[latest_ver]),
      deprecated: curVerDeprecated || latestVerDeprecated ? 'Yes' : '',
      readme_flag: readmeWarn ? 'Possible deprecation' : '',
      src: 'npm'
    };
  } catch (e) {

    const packagistFallback = await getPackagistInfo(pkg.lib, pkg.cur_ver);
    return {
      lib: pkg.lib,
      source: 'packagist',
      cur_ver: packagistFallback.cur_ver,
      cur_ver_date: packagistFallback.cur_ver_date,
      latest_ver: packagistFallback.latest_ver,
      latest_ver_date: packagistFallback.latest_ver_date,
      deprecated: packagistFallback.abandoned ? 'Yes' : '',
      readme_flag: '',
      src: 'packagist'
    };
  }
}

async function getPackagistInfo(lib, cur_ver) {
  const url = `https://repo.packagist.org/p2/${lib}.json`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Packagist fetch failed');
    const data = await res.json();

    const versions = data.packages?.[lib];
    const cleanCurVer = cur_ver.replace(/^v/, '');

    let cur_ver_date = '';
    let latest_ver = '';
    let latest_ver_date = '';
    let abandoned = '';

    for (const v of versions) {
      const verClean = v.version.replace(/^v/, '');
      if (verClean === cleanCurVer) {
        cur_ver_date = v.time?.split('T')[0];
        cur_ver_date = formatDate(cur_ver_date);
      }
    }

    if (versions.length > 0) {
      latest_ver = versions[0].version;
      latest_ver_date = versions[0].time?.split('T')[0];
      latest_ver_date = formatDate(latest_ver_date);
      abandoned = versions[0].abandoned || '';
    }

    return {
      lib,
      cur_ver,
      cur_ver_date,
      latest_ver,
      latest_ver_date,
      abandoned
    };
  } catch (e) {
    return {
      lib,
      cur_ver,
      cur_ver_date: 'ERROR',
      latest_ver: 'ERROR',
      latest_ver_date: 'ERROR',
      abandoned: 'ERROR'
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
    { id: 'readme_flag', title: 'readme_flag' },
    { id: 'src', title: 'src' }
    ]
  });

  await csvWriter.writeRecords(records);

  return finalPath;
}

(async () => {
  const input = await readInputCSV(inputCsvPath);
  const results = [];

  progressBar.start(input.length, 0);

  for (const [index, pkg] of input.entries()) {
    const info = await getReleaseDates(pkg);
    results.push(info);

    progressBar.update(index + 1);
  }

  progressBar.stop();

  console.log(`📄 Writing to output CSV`);
  const finalPath = await writeOutputCSV(results, outputCsvPath);
  console.log(`✅ Output written to ${finalPath}`);
})();