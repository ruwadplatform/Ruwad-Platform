import { Controller, Get } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";

@Controller("health")
export class HealthController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Get()
  async check() {
    let database: "up" | "down" = "down";
    try {
      await this.dataSource.query("SELECT 1");
      database = "up";
    } catch {
      database = "down";
    }
    return { status: database === "up" ? "ok" : "degraded", database };
  }
}
