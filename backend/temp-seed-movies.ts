import 'dotenv/config';
import { ArconteAutoCurator } from './src/auto-curator';
import { TMDBService } from './src/tmdb-service';

(async () => {
  const curator: any = new ArconteAutoCurator();
  const movies = await TMDBService.getTrending();
  console.log(JSON.stringify({ count: movies.length, titles: movies.slice(0, 12).map((m:any) => m.title) }, null, 2));
  for (const movie of movies.slice(0, 12)) {
    await curator.processMovie({
      tmdbId: movie.id,
      title: movie.title,
      year: movie.release_date?.split('-')[0],
      summary: movie.overview,
      large_cover_image: movie.poster_path,
      medium_cover_image: movie.poster_path,
      backdrop_path: movie.backdrop_path,
      genres: []
    }, false);
  }
})();
