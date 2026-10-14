import Image from "next/image";
import Link from "next/link";
import styles from "./catalogue.module.css";

export const metadata = {
  title: "Hospital Apparel Catalogue | KANTIRA",
  description:
    "Explore KANTIRA hospital apparel, including scrub suits, surgical gowns, doctors' lab coats and fabric colour references.",
};

const categories = [
  {
    title: "Scrub Suits",
    description:
      "Coordinated scrub tops and trousers for doctors, nurses and healthcare teams.",
  },
  {
    title: "Surgical Gowns",
    description:
      "Surgical apparel options with specifications confirmed for the intended use.",
  },
  {
    title: "Doctors’ Lab Coats",
    description:
      "Professional white coats with practical pockets and clean finishing.",
  },
  {
    title: "Hospital Staff Uniforms",
    description:
      "Colour-coordinated uniforms for nurses, attendants and support teams.",
  },
];

export default function CataloguePage() {
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.copy}>
          <p className={styles.eyebrow}>KANTIRA · HOSPITAL APPAREL</p>
          <h1>Hospital apparel, made for your team.</h1>
          <p className={styles.intro}>
            Explore our digital catalogue of healthcare apparel and fabric
            colour references. For bulk or institutional requirements, contact
            KANTIRA to confirm available styles, sizes and shades.
          </p>
          <div className={styles.actions}>
            <a
              className={styles.primaryButton}
              href="/assets/catalogue/KANTIRA_Digital_Hospital_Apparel_Catalogue.pdf"
              target="_blank"
              rel="noopener noreferrer"
            >
              View / Download Catalogue
            </a>
            <Link className={styles.secondaryButton} href="/shop">
              Explore Products
            </Link>
          </div>
          <p className={styles.note}>
            Digital colours are approximate. Please approve a physical fabric
            swatch before bulk production.
          </p>
        </div>

        <a
          className={styles.preview}
          href="/assets/catalogue/KANTIRA_Digital_Hospital_Apparel_Catalogue.pdf"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open the KANTIRA digital catalogue PDF"
        >
          <Image
            src="/assets/catalogue/KANTIRA_Website_Catalogue_Banner.png"
            alt="KANTIRA hospital apparel and fabric colour catalogue preview"
            width={1536}
            height={1024}
            priority
            sizes="(max-width: 760px) 100vw, 50vw"
          />
        </a>
      </section>

      <section className={styles.products} aria-labelledby="catalogue-range">
        <p className={styles.eyebrow}>THE COLLECTION</p>
        <h2 id="catalogue-range">Explore the range</h2>
        <div className={styles.grid}>
          {categories.map((item) => (
            <article className={styles.card} key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
        <p className={styles.disclaimer}>
          Product visuals in the catalogue are illustrative. Confirm actual
          product construction, fabric composition, colour availability and
          performance claims with KANTIRA before placing an order.
        </p>
      </section>
    </main>
  );
}
