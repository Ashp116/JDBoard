import type {ReactNode} from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import CodeBlock from '@theme/CodeBlock';
import Heading from '@theme/Heading';

import styles from './index.module.css';

const features: {title: string; body: ReactNode; to: string}[] = [
  {
    title: 'Live monitoring',
    body: <>CPU, GPU, memory, temperatures, power and fan from jtop, streamed to the browser. Processes, logs and power modes in one place.</>,
    to: '/docs/using/monitoring',
  },
  {
    title: 'Models',
    body: <>Download YOLO models or upload your own <code>.pt</code>, <code>.onnx</code> or <code>.engine</code>, and convert them to TensorRT (FP32, FP16 or INT8) on the Jetson.</>,
    to: '/docs/using/models',
  },
  {
    title: 'Inference',
    body: <>Run a model on an image and see boxes, segmentation masks, pose skeletons, oriented boxes and classes drawn on the result.</>,
    to: '/docs/using/inference',
  },
  {
    title: 'Custom scripts',
    body: <>Bring any model: a short Python class handles pre- and post-processing, and returns shapes the dashboard draws.</>,
    to: '/docs/custom-models/custom-scripts',
  },
  {
    title: 'HTTP API',
    body: <>Everything the dashboard does is an API call. Give bots and scripts an API key with just the access they need.</>,
    to: '/docs/api/overview',
  },
  {
    title: 'Secure by default',
    body: <>HTTPS, a login, an optional admin password for dangerous actions, and a service user with no root access.</>,
    to: '/docs/security',
  },
];

function Hero(): ReactNode {
  const {siteConfig} = useDocusaurusContext();
  return (
    <header className={clsx('hero', styles.hero)}>
      <div className="container">
        <img className={styles.logo} src={useBaseUrl('/img/logo.svg')} alt="" width={96} height={96} />
        <Heading as="h1" className={styles.title}>
          {siteConfig.title}
        </Heading>
        <p className={styles.tagline}>{siteConfig.tagline}</p>
        <div className={styles.buttons}>
          <Link className="button button--primary button--lg" to="/docs/getting-started/installation">
            Install JDBoard
          </Link>
          <Link className="button button--secondary button--lg" to="/docs/intro">
            Read the docs
          </Link>
          <Link className="button button--secondary button--lg" to="/docs/api/overview">
            API reference
          </Link>
        </div>
      </div>
    </header>
  );
}

export default function Home(): ReactNode {
  return (
    <Layout
      title="Jetson dashboard"
      description="JDBoard: monitoring, model management and inference for NVIDIA Jetson, in the browser.">
      <Hero />
      <main>
        <section className={styles.section}>
          <div className="container">
            <div className="row">
              {features.map(feature => (
                <div key={feature.title} className={clsx('col col--4', styles.featureCol)}>
                  <Link to={feature.to} className={styles.feature}>
                    <Heading as="h3">{feature.title}</Heading>
                    <p>{feature.body}</p>
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section className={clsx(styles.section, styles.install)}>
          <div className="container">
            <Heading as="h2">Install in a few minutes</Heading>
            <p>
              On a Jetson with JetPack 6 or 7 and{' '}
              <Link to="/docs/getting-started/prerequisites">jtop installed</Link>, run this in a terminal:
            </p>
            <CodeBlock language="bash">
              {`git clone https://github.com/Ashp116/JDBoard.git
cd JDBoard
sudo ./scripts/install.sh --with-pytorch`}
            </CodeBlock>
            <p>
              Then open <code>https://&lt;jetson-ip&gt;/</code> and log in.{' '}
              <Link to="/docs/getting-started/installation">Full installation guide →</Link>
            </p>
          </div>
        </section>
      </main>
    </Layout>
  );
}
