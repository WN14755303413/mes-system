import { Global, Module } from '@nestjs/common';
import { CodeGeneratorService } from './code-generator.service';

/**
 * 编号生成基础设施。设为全局：项目、BOM、工单、质检单等都要生成单据号，
 * 与 PrismaModule 一样作为横切能力提供，业务模块无需逐个 import。
 */
@Global()
@Module({
  providers: [CodeGeneratorService],
  exports: [CodeGeneratorService],
})
export class CodeModule {}
