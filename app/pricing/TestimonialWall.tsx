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
