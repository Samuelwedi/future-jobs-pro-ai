const { withDangerousMod, withXcodeProject } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const requireAsset = (projectRoot, name) => {
  const source = path.join(projectRoot, 'assets', 'wake-word', name);
  if (!fs.existsSync(source)) {
    throw new Error(`Missing ${source}. Download the custom Picovoice keyword model before building.`);
  }
  return source;
};

module.exports = function withLucyWakeWord(config) {
  config = withDangerousMod(config, ['android', async mod => {
    const destinationDirectory = path.join(mod.modRequest.platformProjectRoot, 'app', 'src', 'main', 'assets');
    fs.mkdirSync(destinationDirectory, { recursive: true });
    for (const name of ['hey_lucy_android.ppn', 'lucy_android.ppn']) {
      const source = requireAsset(mod.modRequest.projectRoot, name);
      fs.copyFileSync(source, path.join(destinationDirectory, name));
    }
    return mod;
  }]);

  config = withDangerousMod(config, ['ios', async mod => {
    for (const name of ['hey_lucy_ios.ppn', 'lucy_ios.ppn']) {
      const source = requireAsset(mod.modRequest.projectRoot, name);
      fs.copyFileSync(source, path.join(mod.modRequest.platformProjectRoot, name));
    }
    return mod;
  }]);

  config = withXcodeProject(config, mod => {
    const project = mod.modResults;
    const target = project.getFirstTarget();
    for (const name of ['hey_lucy_ios.ppn', 'lucy_ios.ppn']) {
      const resource = project.pbxFileReferenceSection();
      const alreadyAdded = Object.values(resource).some(value => value && value.path === name);
      if (!alreadyAdded) project.addResourceFile(name, { target: target.uuid });
    }
    return mod;
  });

  return config;
};
