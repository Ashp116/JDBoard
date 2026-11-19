import type {ReactNode} from 'react';
import styles from './styles.module.css';

// How a request travels through JDBoard. Plain HTML boxes, so the text always
// fits; on narrow screens the flow stacks vertically.

function Box({title, children, accent}: {title: string; children?: ReactNode; accent?: boolean}) {
  return (
    <div className={accent ? `${styles.box} ${styles.accent}` : styles.box}>
      <div className={styles.title}>{title}</div>
      {children && <div className={styles.body}>{children}</div>}
    </div>
  );
}

function Arrow({label}: {label?: string}) {
  return (
    <div className={styles.arrow} aria-hidden="true">
      {label && <span className={styles.arrowLabel}>{label}</span>}
      <span className={styles.arrowLine} />
    </div>
  );
}

export default function ArchitectureDiagram(): ReactNode {
  return (
    <figure className={styles.diagram} aria-label="How a request travels through JDBoard">
      <div className={styles.flow}>
        <Box title="Browser or API client" />
        <Arrow label="HTTPS" />
        <Box title="nginx">login, API keys, dashboard files</Box>
        <Arrow label="/api" />
        <Box title="JDBoard backend" accent>
          Flask on 127.0.0.1:5001, runs as user <code>jdboard</code>
        </Box>
        <Arrow />
        <div className={styles.fan}>
          <Box title="jtop.service">system data, hardware controls</Box>
          <Box title="Inference worker">PyTorch / TensorRT, only while a model is loaded</Box>
          <Box title="jdboard-admin">reboot, shutdown, cache: the only root access</Box>
        </div>
      </div>
    </figure>
  );
}
