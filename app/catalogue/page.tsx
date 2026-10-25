import Image from "next/image";
import Link from "next/link";
import { StorefrontShell } from "@/components/storefront/storefront-shell";
import styles from "./catalogue.module.css";
import { CATALOGUE_SHADES } from "./shade-reference";

export const metadata = {
  title: "Hospital Apparel Catalogue | KANTIRA",
  description:
    "Explore KANTIRA hospital apparel, including scrub suits, surgical gowns, doctors' lab coats and fabric colour references.",
  // The same landing page is served at / and /catalogue; / is the canonical URL.
  alternates: { canonical: "/" },
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

const CATALOGUE_PDF_PATH =
  "/assets/catalogue/KANTIRA_Digital_Hospital_Apparel_Catalogue.pdf";
const CATALOGUE_OVERVIEW_IMAGE_PATH =
  "/assets/catalogue/kantira-hospital-apparel-catalogue-clean-8fee4ea8.png";

export default function CataloguePage() {
  return (
    <StorefrontShell>
      <div className={`mx-auto max-w-6xl px-6 py-10 ${styles.page}`}>
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
                href={CATALOGUE_PDF_PATH}
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
            href={CATALOGUE_PDF_PATH}
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

        <section className={styles.overview} aria-labelledby="catalogue-overview">
          <p className={styles.eyebrow}>CATALOGUE OVERVIEW</p>
          <h2 id="catalogue-overview">Hospital apparel and fabric colour range</h2>
          <p className={styles.overviewIntro}>
            A visual overview of the apparel categories and fabric colour
            references in the KANTIRA hospital catalogue. Open the PDF catalogue
            for the full document.
          </p>
          <figure className={styles.overviewFigure}>
            <Image
              src={CATALOGUE_OVERVIEW_IMAGE_PATH}
              alt="KANTIRA hospital apparel catalogue overview showing scrub suits, contrast scrub suits, surgical gowns, patient gowns, doctors' lab coats and hospital staff uniforms, above a fabric colour range of swatches with names and catalogue codes. The full list of shade names and codes follows below the image."
              width={1536}
              height={1024}
              quality={85}
              sizes="(max-width: 1152px) 100vw, 1104px"
            />
            <figcaption>
              Illustrative catalogue overview showing a selection of garments and
              fabric shades. Garment visuals and digital colours are approximate;
              confirm styles, specifications and colours with KANTIRA, and approve
              a physical fabric swatch before bulk production.
            </figcaption>
          </figure>
          <a
            className={styles.secondaryButton}
            href={CATALOGUE_PDF_PATH}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open the PDF catalogue
          </a>
        </section>

        <section className={styles.shades} aria-labelledby="catalogue-shades">
          <p className={styles.eyebrow}>FABRIC COLOUR REFERENCE</p>
          <h2 id="catalogue-shades">Shade names and catalogue codes</h2>
          <p className={styles.shadesIntro}>
            Names and codes follow the KANTIRA catalogue and the supplier
            references it was transcribed from. Colour chips are approximate
            digital references only; the physical fabric swatch is the authority,
            so please approve a swatch before bulk production.
          </p>
          <ul className={styles.shadeList} aria-label="Fabric shade reference">
            {CATALOGUE_SHADES.map((shade) => (
              <li className={styles.shade} key={shade.code}>
                <span
                  className={styles.chip}
                  style={{ backgroundColor: shade.indicativeHex }}
                  aria-hidden="true"
                />
                <span className={styles.shadeText}>
                  <span className={styles.shadeName}>{shade.name}</span>
                  <span className={styles.shadeCode}>{`Code ${shade.code}`}</span>
                </span>
              </li>
            ))}
          </ul>
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
      </div>
    </StorefrontShell>
  );
}
