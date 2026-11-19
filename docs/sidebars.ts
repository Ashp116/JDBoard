import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docsSidebar: [
    'intro',
    {
      type: 'category',
      label: 'Getting started',
      collapsed: false,
      items: [
        'getting-started/prerequisites',
        'getting-started/installation',
        'getting-started/first-steps',
        'getting-started/updating',
        'getting-started/development',
      ],
    },
    {
      type: 'category',
      label: 'Using JDBoard',
      items: [
        'using/dashboard',
        'using/models',
        'using/inference',
        'using/monitoring',
        'using/terminal',
        'using/settings',
      ],
    },
    {
      type: 'category',
      label: 'Custom models',
      items: ['custom-models/custom-scripts', 'custom-models/annotations'],
    },
    {
      type: 'category',
      label: 'Commands and scripts',
      items: [
        'commands/install-script',
        'commands/jdboard-passwd',
        'commands/jdboard-pip',
        'commands/jdboard-pytorch',
        'commands/service',
      ],
    },
    'security',
    'troubleshooting',
  ],
  apiSidebar: [
    'api/overview',
    'api/authentication',
    'api/inference',
    'api/models',
    'api/system',
    'api/logs',
    'api/realtime',
  ],
};

export default sidebars;
