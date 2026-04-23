import { Module } from "@nestjs/common";

import { SourceController } from "./source.controller.js";

@Module({
  controllers: [SourceController],
})
export class SourceModule {}
