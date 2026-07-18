import { Global, Module } from '@nestjs/common';
import { StorageService } from './storage.service';

/**
 * 文件存储基础设施（M5）。设为全局：图纸、附件、现场照片（M7）都要落文件，
 * 与 CodeModule 一样作为横切能力提供，业务模块无需逐个 import。
 */
@Global()
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
