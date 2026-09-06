import Image from "next/image";
import styles from "./pricing.module.css";

const TESTIMONIAL_PHOTOS = [
  { src: "/testimonials-wall/testimonial-01.png", width: 332, height: 720 },
  { src: "/testimonials-wall/testimonial-02.png", width: 332, height: 720 },
  { src: "/testimonials-wall/testimonial-03.png", width: 470, height: 720 },
  { src: "/testimonials-wall/testimonial-04.png", width: 332, height: 720 },
  { src: "/testimonials-wall/testimonial-05.png", width: 524, height: 720 },
  { src: "/testimonials-wall/testimonial-06.png", width: 491, height: 720 },
  { src: "/testimonials-wall/testimonial-07.png", width: 596, height: 720 },
  { src: "/testimonials-wall/testimonial-08.png", width: 720, height: 701 },
  { src: "/testimonials-wall/testimonial-09.png", width: 720, height: 608 },
  { src: "/testimonials-wall/testimonial-10.png", width: 690, height: 720 },
  { src: "/testimonials-wall/testimonial-11.png", width: 720, height: 394 },
  { src: "/testimonials-wall/testimonial-12.png", width: 720, height: 562 },
  { src: "/testimonials-wall/testimonial-13.png", width: 720, height: 619 },
  { src: "/testimonials-wall/testimonial-14.png", width: 720, height: 674 },
  { src: "/testimonials-wall/testimonial-15.png", width: 720, height: 323 },
  { src: "/testimonials-wall/testimonial-16.png", width: 332, height: 720 },
  { src: "/testimonials-wall/testimonial-17.png", width: 466, height: 720 },
  { src: "/testimonials-wall/testimonial-18.png", width: 496, height: 720 },
  { src: "/testimonials-wall/testimonial-19.png", width: 332, height: 720 },
  { src: "/testimonials-wall/testimonial-20.png", width: 537, height: 720 },
  { src: "/testimonials-wall/testimonial-21.png", width: 463, height: 720 },
  { src: "/testimonials-wall/testimonial-22.png", width: 332, height: 720 },
  { src: "/testimonials-wall/testimonial-23.png", width: 565, height: 720 },
  { src: "/testimonials-wall/testimonial-24.png", width: 720, height: 321 },
  { src: "/testimonials-wall/testimonial-25.png", width: 720, height: 164 },
  { src: "/testimonials-wall/testimonial-26.png", width: 623, height: 720 },
  { src: "/testimonials-wall/testimonial-27.png", width: 642, height: 720 },
  { src: "/testimonials-wall/testimonial-28.png", width: 554, height: 720 },
  { src: "/testimonials-wall/testimonial-29.png", width: 720, height: 406 },
  { src: "/testimonials-wall/testimonial-30.png", width: 720, height: 421 },
  { src: "/testimonials-wall/testimonial-31.png", width: 720, height: 391 },
  { src: "/testimonials-wall/testimonial-32.png", width: 720, height: 511 },
  { src: "/testimonials-wall/testimonial-33.png", width: 720, height: 595 },
  { src: "/testimonials-wall/testimonial-34.png", width: 593, height: 720 },
  { src: "/testimonials-wall/testimonial-35.png", width: 720, height: 698 },
  { src: "/testimonials-wall/testimonial-36.png", width: 475, height: 720 },
  { src: "/testimonials-wall/testimonial-37.png", width: 720, height: 182 },
  { src: "/testimonials-wall/testimonial-38.png", width: 714, height: 720 },
  { src: "/testimonials-wall/testimonial-39.png", width: 642, height: 720 },
  { src: "/testimonials-wall/testimonial-40.png", width: 720, height: 639 },
  { src: "/testimonials-wall/testimonial-41.png", width: 720, height: 431 },
  { src: "/testimonials-wall/testimonial-42.png", width: 656, height: 720 },
  { src: "/testimonials-wall/testimonial-43.png", width: 690, height: 720 },
  { src: "/testimonials-wall/testimonial-44.png", width: 524, height: 720 },
  { src: "/testimonials-wall/testimonial-45.png", width: 720, height: 697 },
  { src: "/testimonials-wall/testimonial-46.png", width: 626, height: 720 },
  { src: "/testimonials-wall/testimonial-47.png", width: 720, height: 486 },
  { src: "/testimonials-wall/testimonial-48.png", width: 720, height: 149 },
  { src: "/testimonials-wall/testimonial-49.png", width: 720, height: 705 },
  { src: "/testimonials-wall/testimonial-50.png", width: 502, height: 720 },
  { src: "/testimonials-wall/testimonial-51.png", width: 720, height: 497 },
  { src: "/testimonials-wall/testimonial-52.png", width: 720, height: 720 },
  { src: "/testimonials-wall/testimonial-53.png", width: 630, height: 720 },
  { src: "/testimonials-wall/testimonial-54.png", width: 433, height: 720 },
  { src: "/testimonials-wall/testimonial-55.png", width: 720, height: 667 },
  { src: "/testimonials-wall/testimonial-56.png", width: 396, height: 720 },
  { src: "/testimonials-wall/testimonial-57.png", width: 331, height: 720 },
] as const;

export function TestimonialWall() {
  return (
    <div className={styles.testimonialWall}>
      {TESTIMONIAL_PHOTOS.map((photo) => (
        <div className={styles.testimonialPhoto} key={photo.src}>
          <Image
            src={photo.src}
            width={photo.width}
            height={photo.height}
            alt="1500 Blueprint student testimonial"
            sizes="(max-width: 560px) 45vw, (max-width: 800px) 30vw, 220px"
          />
        </div>
      ))}
    </div>
  );
}
