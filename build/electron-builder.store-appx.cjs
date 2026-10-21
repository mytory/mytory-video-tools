const packageJson = require("../package.json");

const identityName = "Mytory.MytoryVideoTools";
const publisher = "CN=4BFD0401-923C-4D45-BFD7-37C1C80CBF91";
// electron-builder defaults Application.Id to identityName; pin that same valid value explicitly.
const applicationId = "Mytory.MytoryVideoTools";
const displayName = "Mytory Video Tools";
const publisherDisplayName = "Mytory";

module.exports = {
  ...packageJson.build,
  win: {
    ...packageJson.build.win,
    target: ["appx"],
  },
  appx: {
    identityName,
    publisher,
    applicationId,
    displayName,
    publisherDisplayName,
    artifactName: "Mytory-Video-Tools-v${version}-${arch}.${ext}",
    languages: ["en-US", "ko-KR", "ja-JP", "zh-CN", "es-ES", "pt-PT", "fr-FR", "id-ID", "hi-IN"],
  },
};
