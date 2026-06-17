import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { PostExtractionProcessor } from './post-extraction.processor';

@Module({
  imports: [BullModule.registerQueue({ name: 'extraction-validation' })],
  controllers: [FilesController],
  providers: [FilesService, PostExtractionProcessor],
  exports: [FilesService],
})
export class FilesModule {}
