// Constants and Types
interface TextNodeInfo {
  id: string;
  text: string;
  font: string;
}

interface ContainerData {
  frameName: string;
  texts: TextNodeInfo[];
}

// Main plugin setup
figma.showUI(__html__);
figma.ui.resize(500, 650);

// Helper functions
function getContainerName(parent: BaseNode | null): string {
  if (!parent) return 'Normal Texts';
  switch (parent.type) {
    case 'FRAME':
      return `FRAME: ${parent.name}`;
    case 'GROUP':
      return `GROUP: ${parent.name}`;
    case 'PAGE':
      return `PAGE: ${parent.name}`;
    default:
      return 'Normal Texts';
  }
}

async function listAvailableFonts() {
  try {
    const availableFonts = await figma.listAvailableFontsAsync();
    const fontFamilies = availableFonts.map(font => ({
      family: font.fontName.family || 'Unknown Family'
    }));

    figma.ui.postMessage({
      type: 'populate-fonts',
      fonts: fontFamilies
    });
  } catch (error) {
    console.error('Error fetching available fonts:', error);
    figma.notify('Failed to load fonts. Please try again later.');
  }
}

function sendSelectedTextsToUI() {
  const containersWithTexts = new Map<string, TextNodeInfo[]>();
  const selectedTextNodes = figma.currentPage.selection.filter(node => node.type === 'TEXT') as TextNode[];

  if (selectedTextNodes.length === 0) {
    const selectedFrames = figma.currentPage.selection.filter(node => node.type === 'FRAME') as FrameNode[];

    if (selectedFrames.length > 0) {
      selectedFrames.forEach(frame => {
        const textNodesInFrame = frame.findAll(node => node.type === 'TEXT') as TextNode[];
        textNodesInFrame.forEach(node => {
          const containerName = getContainerName(frame);
          if (!containersWithTexts.has(containerName)) {
            containersWithTexts.set(containerName, []);
          }
          containersWithTexts.get(containerName)?.push({
            id: node.id,
            text: node.characters,
            font: (node.fontName as FontName).family
          });
        });
      });
    } else {
      figma.ui.postMessage({ type: 'update-message-visibility', showMessage: true });
      return;
    }
  } else {
    selectedTextNodes.forEach(node => {
      const containerName = getContainerName(node.parent);
      if (!containersWithTexts.has(containerName)) {
        containersWithTexts.set(containerName, []);
      }
      containersWithTexts.get(containerName)?.push({
        id: node.id,
        text: node.characters,
        font: (node.fontName as FontName).family
      });
    });
  }

  const showMessage = containersWithTexts.size === 0;

  figma.ui.postMessage({ type: 'update-message-visibility', showMessage });

  if (!showMessage) {
    const structuredData = Array.from(containersWithTexts.entries())
      .map(([frameName, texts]) => ({
        frameName,
        texts: texts.map(textInfo => `
          <div>
            <input style="" type="checkbox" id="${textInfo.id}" value="${textInfo.id}" checked>
            <span style="font-family: ${textInfo.font};">${textInfo.font}</span>
          </div>
        `).join('')
      }))
      .sort((a, b) => a.frameName.localeCompare(b.frameName));

    figma.ui.postMessage({
      type: 'update-selected-text',
      selectedTextsWithFonts: structuredData
    });
  }
}

// Event handlers
async function handleReplaceFont(msg: { font: string; weight: string; selectedNodes: { id: string; font: string; weight: string }[] }) {
  const fontData = { family: msg.font, style: msg.weight };

  try {
    await figma.loadFontAsync(fontData);
    for (const nodeInfo of msg.selectedNodes) {
      const node = await figma.getNodeByIdAsync(nodeInfo.id);
      if (node?.type === 'TEXT') {
        node.fontName = fontData; // Apply the font
      }
    }

    figma.notify(`Replaced fonts with ${msg.font} (${msg.weight})!`);
    sendSelectedTextsToUI();
  } catch (error) {
    console.error(`Error applying ${msg.font}:`, error);
    figma.notify(`Failed to apply font. Please try a different weight/style.`);
  }
}

async function handleReplaceAllFonts(msg: { font: string; weight: string }) {
  const fontData = { family: msg.font, style: msg.weight };

  try {
    await figma.loadFontAsync(fontData);
    const allTextNodes = figma.currentPage.findAll(node => node.type === 'TEXT');
    allTextNodes.forEach((node: SceneNode) => {
      if (node.type === 'TEXT') {
        (node as TextNode).fontName = fontData; // Apply the font
      }
    });

    figma.notify(`Replaced all text fonts with ${msg.font} (${msg.weight})!`);
  } catch (error) {
    console.error(`Error applying ${msg.font}:`, error);
    figma.notify(`Failed to apply font. Please try a different weight/style.`);
  }
}

async function checkAvailableWeights(family: string) {
  const availableFonts = await figma.listAvailableFontsAsync();
  const weights = availableFonts
    .filter(font => font.fontName.family === family)
    .map(font => font.fontName.style);

  console.log(`Available weights for ${family}:`, weights);

  // Send the available weights back to the UI
  figma.ui.postMessage({ type: 'available-weights', weights });
}
// Event listeners
figma.on('selectionchange', sendSelectedTextsToUI);
figma.ui.onmessage = async (msg) => {
  switch (msg.type) {
    case 'replace-font':
      await handleReplaceFont(msg);
      break;
    case 'replace-all-fonts':
      await handleReplaceAllFonts(msg);
      break;
    case 'check-font-weights':
      await checkAvailableWeights(msg.family);
      break;
    case 'restart-plugin':
      figma.reload();
      break;
  }
};

// Initialize: Send selected texts to UI when the plugin opens
sendSelectedTextsToUI();
listAvailableFonts(); // Fetch available fonts on startup




