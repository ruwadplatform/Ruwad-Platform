import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { NewsArticle } from "./news-article.entity";
import { NewsRelatedEntity } from "./news-related-entity.entity";
import { NewsService } from "./news.service";
import { NewsController } from "./news.controller";

@Module({
  imports: [TypeOrmModule.forFeature([NewsArticle, NewsRelatedEntity])],
  providers: [NewsService],
  controllers: [NewsController],
  exports: [NewsService, TypeOrmModule],
})
export class NewsModule {}
