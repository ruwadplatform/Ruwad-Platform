import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Investment } from "./investment.entity";
import { InvestmentsService } from "./investments.service";

@Module({
  imports: [TypeOrmModule.forFeature([Investment])],
  providers: [InvestmentsService],
  exports: [InvestmentsService, TypeOrmModule],
})
export class InvestmentsModule {}
