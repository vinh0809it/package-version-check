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

const sources = [
  { name: 'npm', handler: getNpmInfo },
  { name: 'packagist', handler: getPackagistInfo },
  { name: 'pypi', handler: getPyPiInfo }
];

async function getReleaseDates(pkg) {

  for (const source of sources) {
    try {
      console.log(`🔍 Trying ${source.name} for ${pkg.lib}...`);
      const result = await source.handler(pkg.lib, pkg.cur_ver);

      if (result) {
        console.log(`✅ Found info from ${source.name}`);
        return result;
      }

    } catch (err) {
      console.log(`⚠️  Failed to get info from ${source.name}: ${err.message}`);
    }
  }

  return {
    lib: pkg.lib,
    cur_ver: pkg.cur_ver,
    cur_ver_date: 'ERROR',
    latest_ver: 'ERROR',
    latest_ver_date: 'ERROR',
    abandoned: 'ERROR'
  };
}

async function getNpmInfo(lib, cur_ver) {
    const url = `https://registry.npmjs.org/${lib}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Npm fetch failed`);

    const data = await res.json();
    const time = data.time || {};

    const isMatchVersion = !data.versions || !data.versions[cur_ver];

    if (isMatchVersion) {
      throw new Error(`Version ${cur_ver} not found for ${lib}`);
    }

    const latest_ver = data['dist-tags']?.latest;

    const curVerDeprecated = data.versions?.[cur_ver]?.deprecated || '';
    const latestVerDeprecated = data.versions?.[latest_ver]?.deprecated || '';

    const readme = data.readme || '';
    const readmeWarn = /deprecated|no longer maintained|end of life|eol|unmaintained|dropped|removed/i.test(readme);

    return {
      lib: lib,
      cur_ver: cur_ver,
      cur_ver_date: formatDate(time[cur_ver]),
      latest_ver,
      latest_ver_date: formatDate(time[latest_ver]),
      deprecated: curVerDeprecated || latestVerDeprecated ? 'Yes' : '',
      readme_flag: readmeWarn ? 'Possible deprecation' : '',
      src: 'npm'
    };
}

async function getPackagistInfo(lib, cur_ver) {
  const url = `https://repo.packagist.org/p2/${lib}.json`;

  const res = await fetch(url);
  if (!res.ok) throw new Error('Packagist fetch failed');
  const data = await res.json();

  const versions = data.packages?.[lib];
  const cleanCurVer = cur_ver.replace(/^v/, '');

  let cur_ver_date = '';
  let latest_ver = '';
  let latest_ver_date = '';
  let abandoned = '';

  const isMatchVersion = versions.find(v => v.version === cur_ver);
  if (!isMatchVersion) {
    throw new Error(`Version ${cur_ver} not found for ${lib}`);
  }

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
    lib: lib,
    cur_ver: cur_ver,
    cur_ver_date: cur_ver_date,
    latest_ver: latest_ver,
    latest_ver_date: latest_ver_date,
    deprecated: abandoned ? 'Yes' : '',
    readme_flag: '',
    src: 'packagist'
  };
}

async function getPyPiInfo(lib, cur_ver) {
  const url = `https://pypi.org/pypi/${lib}/json`;

  const res = await fetch(url);
  if (!res.ok) throw new Error('PyPI fetch failed');

  const data = await res.json();

  const releases = data.releases || {};

  const isMatchVersion = !releases || !releases[cur_ver];
  if (isMatchVersion) {
    throw new Error(`Version ${cur_ver} not found for ${lib}`);
  }

  const curRelease = releases[cur_ver]?.[0];
  const latest_ver = data.info.version;
  const latestRelease = releases[latest_ver]?.[0];
  const readmeWarn = /deprecated|no longer maintained|end of life|eol|unmaintained|dropped|removed/i.test(data.info.description) ? 'Possible deprecation' : '';

  return {
    lib,
    cur_ver,
    cur_ver_date: curRelease?.upload_time?.split('T')[0] || '',
    latest_ver,
    latest_ver_date: latestRelease?.upload_time?.split('T')[0] || '',
    deprecated: data.info.yanked ? 'Yes' : '',
    readme_flag: readmeWarn,
    src: 'pypi'
  };
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
  const progressTotal = input.length;
  const results = [];

  progressBar.start(progressTotal, 0);
  
  for (const [index, pkg] of input.entries()) {

    progressBar.stop();

    const info = await getReleaseDates(pkg);
    results.push(info);

    progressBar.start(progressTotal, index);
    progressBar.update(index + 1);
  }

  progressBar.stop();

  console.log(`📄 Writing to output CSV`);
  const finalPath = await writeOutputCSV(results, outputCsvPath);
  console.log(`✅ Output written to ${finalPath}`);
})();