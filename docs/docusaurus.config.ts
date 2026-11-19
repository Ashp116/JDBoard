import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const config: Config = {
  title: 'JDBoard',
  tagline: 'A dashboard for NVIDIA Jetson: monitoring, models and inference in the browser',
  favicon: 'img/logo.svg',

  future: {
    v4: true,
  },

  // Published with GitHub Pages at https://ashp116.github.io/JDBoard/
  url: 'https://ashp116.github.io',
  baseUrl: '/JDBoard/',
  organizationName: 'Ashp116',
  projectName: 'JDBoard',
  trailingSlash: false,

  onBrokenLinks: 'throw',
  markdown: {
    mermaid: true,
    hooks: {
      onBrokenMarkdownLinks: 'throw',
    },
  },

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  themes: ['@docusaurus/theme-mermaid'],

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          // "main" is docs/ as it is on the main branch, shown by default.
          // Each GitHub release adds a snapshot (versioned_docs/version-<tag>),
          // chosen from the version dropdown: see .github/workflows/docs.yml.
          lastVersion: 'current',
          versions: {
            current: {
              label: 'main',
            },
          },
          editUrl: 'https://github.com/Ashp116/JDBoard/tree/main/docs/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    colorMode: {
      defaultMode: 'dark',
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'JDBoard',
      logo: {
        alt: 'JDBoard logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Docs',
        },
        {
          type: 'docSidebar',
          sidebarId: 'apiSidebar',
          position: 'left',
          label: 'API',
        },
        {
          type: 'docsVersionDropdown',
          position: 'right',
        },
        {
          href: 'https://github.com/Ashp116/JDBoard',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            {label: 'Introduction', to: '/docs/intro'},
            {label: 'Installation', to: '/docs/getting-started/installation'},
            {label: 'Commands', to: '/docs/commands/install-script'},
          ],
        },
        {
          title: 'Reference',
          items: [
            {label: 'API', to: '/docs/api/overview'},
            {label: 'Custom inference scripts', to: '/docs/custom-models/custom-scripts'},
          ],
        },
        {
          title: 'Project',
          items: [
            {label: 'GitHub', href: 'https://github.com/Ashp116/JDBoard'},
            {label: 'Issues', href: 'https://github.com/Ashp116/JDBoard/issues'},
          ],
        },
      ],
      copyright: `JDBoard. Built with Docusaurus.`,
    },
    mermaid: {
      theme: {light: 'neutral', dark: 'dark'},
      options: {
        // Measure labels in the same font the page draws them in; Mermaid's
        // default (Trebuchet) is narrower, so the text was cut off
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, Ubuntu, Cantarell, "Noto Sans", sans-serif',
        flowchart: {
          padding: 16,
          nodeSpacing: 40,
          rankSpacing: 60,
        },
      },
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'python', 'json'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
