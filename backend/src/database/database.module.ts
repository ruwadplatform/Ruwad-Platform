import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: "postgres",
        url: config.get<string>("DATABASE_URL"),
        ssl: config.get<string>("DATABASE_SSL") === "true" ? { rejectUnauthorized: false } : false,
        autoLoadEntities: true,
        // Schema changes are applied through TypeORM migrations
        // (npm run migration:run), never through synchronize — including
        // in development, so the migration history stays trustworthy.
        synchronize: false,
        logging: config.get<string>("NODE_ENV") !== "production" ? ["error", "warn"] : ["error"],
      }),
    }),
  ],
})
export class DatabaseModule {}
