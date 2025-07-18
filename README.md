# 📦 Package EOL Checker

A simple Node.js CLI tool to check the status of NPM/Packagist/PyPi packages based on:

- Current version release date
- Latest version release date
- Deprecation status
- README deprecation hints

Useful for auditing project dependencies and identifying potentially unmaintained or deprecated libraries.

---

## 📗 Usage
1. ```npm install```
2. ```node package-check.js```

## 📂 Input Format

The input should be a CSV file named `input.csv` in the following format:

```csv
lib,cur_ver
@expo/sdk-runtime-versions,1.0.0
@expo/spawn-async,1.7.2
@expo-google-fonts/space-grotesk,0.2.2
@fancyapps/ui,4.0.31
```

## 📂 Output

The output csv will be

```csv
lib,cur_ver,cur_ver_date,latest_ver,latest_ver_date,deprecated,readme_flag,src
@expo/sdk-runtime-versions,1.0.0,2021/4/6,1.0.0,2021/4/6,,npm
@expo/spawn-async,1.7.2,2023/3/18,1.7.2,2023/3/18,,npm
@expo-google-fonts/space-grotesk,0.2.2,2022/1/15,0.4.0,2025/5/28,,npm
@fancyapps/ui,4.0.31,2022/7/29,5.0.36,2024/4/10,,npm
```