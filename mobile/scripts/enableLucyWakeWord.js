const fs = require('fs');
const path = require('path');

const mobileRoot = path.resolve(__dirname, '..');
const configPath = path.join(mobileRoot, 'app.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const plugins = Array.isArray(config.expo.plugins) ? config.expo.plugins : [];
const pluginName = './plugins/withLucyWakeWord';
const hasPlugin = plugins.some(plugin => plugin === pluginName || (Array.isArray(plugin) && plugin[0] === pluginName));

if (!hasPlugin) plugins.push(pluginName);
config.expo.plugins = plugins;
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');

console.log(hasPlugin ? 'Lucy wake-word plugin was already enabled.' : 'Lucy wake-word plugin added to app.json.');
