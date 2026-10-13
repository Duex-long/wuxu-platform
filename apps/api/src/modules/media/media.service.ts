import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnApplicationBootstrap,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectModel } from "@nestjs/mongoose";
import type { ImageAssetSummary } from "@wuxu/shared-types";
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createHash, randomUUID } from "node:crypto";
import { Model, Types } from "mongoose";

import type { AuthenticatedUser } from "../../common/auth-user";
import { MediaAsset, type MediaAssetDocument } from "./media-asset.schema";

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

@Injectable()
export class MediaService implements OnApplicationBootstrap {
  private readonly bucket: string;
  private readonly s3: S3Client;

  constructor(
    @InjectModel(MediaAsset.name) private readonly mediaModel: Model<MediaAsset>,
    config: ConfigService,
  ) {
    this.bucket = config.get<string>("S3_BUCKET", "wuxu-items");
    this.s3 = new S3Client({
      endpoint: config.get<string>("S3_ENDPOINT", "http://object-storage:8333"),
      region: config.get<string>("S3_REGION", "us-east-1"),
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.get<string>("S3_ACCESS_KEY", "wuxu-dev"),
        secretAccessKey: config.get<string>("S3_SECRET_KEY", "wuxu-dev-secret"),
      },
    });
  }

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      await this.s3.send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
  }

  async uploadImage(ownerId: string, file?: Express.Multer.File): Promise<ImageAssetSummary> {
    if (!file) throw new BadRequestException("请选择图片文件");
    if (file.size === 0 || file.size > MAX_IMAGE_SIZE) throw new BadRequestException("图片大小必须在 1B 到 10MB 之间");
    const mimeType = this.detectMimeType(file.buffer);
    if (mimeType === null) throw new BadRequestException("仅支持 JPEG、PNG、WebP 或 GIF 图片");

    const checksumSha256 = createHash("sha256").update(file.buffer).digest("hex");
    const objectKey = `items/${ownerId}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${this.extensionFor(mimeType)}`;
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        Body: file.buffer,
        ContentType: mimeType,
        Metadata: { checksumSha256 },
      }),
    );

    try {
      const asset = await this.mediaModel.create({
        ownerId,
        objectKey,
        originalName: file.originalname.slice(0, 255),
        mimeType,
        size: file.size,
        checksumSha256,
      });
      return this.toSummary(asset);
    } catch (error) {
      await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey })).catch(() => undefined);
      throw error;
    }
  }

  async getAccessible(user: AuthenticatedUser, id: string): Promise<{ asset: MediaAssetDocument; body: Uint8Array }> {
    const asset = await this.findById(id);
    const linkedLocationId = asset.linkedLocationId ?? null;
    if (user.role !== "ADMIN" && asset.ownerId !== user.id && linkedLocationId === null) {
      throw new NotFoundException("图片不存在");
    }
    const output = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: asset.objectKey }));
    if (!output.Body) throw new NotFoundException("图片文件不存在");
    return { asset, body: await output.Body.transformToByteArray() };
  }

  async deleteUnlinked(ownerId: string, id: string): Promise<void> {
    const asset = await this.findById(id, ownerId);
    if ((asset.linkedItemId ?? null) !== null || (asset.linkedLocationId ?? null) !== null) {
      throw new ConflictException("已关联业务数据的图片不能直接删除");
    }
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: asset.objectKey }));
    asset.deletedAt = new Date();
    await asset.save();
  }

  async validateOwnership(ownerId: string, imageIds: string[]): Promise<void> {
    if (new Set(imageIds).size !== imageIds.length) throw new BadRequestException("图片列表包含重复项");
    if (imageIds.length === 0) return;
    if (imageIds.some((id) => !Types.ObjectId.isValid(id))) throw new BadRequestException("图片不存在或无权访问");
    const assets = await this.mediaModel.find({
      _id: { $in: imageIds.map((id) => new Types.ObjectId(id)) },
      ownerId,
      deletedAt: null,
    });
    if (assets.length !== imageIds.length) throw new BadRequestException("图片不存在或无权访问");
    if (assets.some((asset) => (asset.linkedItemId ?? null) !== null || (asset.linkedLocationId ?? null) !== null)) {
      throw new ConflictException("图片已经关联到其他业务数据");
    }
  }

  async syncItemLinks(ownerId: string, itemId: string, previousIds: string[], nextIds: string[]): Promise<void> {
    const addedIds = nextIds.filter((id) => !previousIds.includes(id));
    await this.validateOwnership(ownerId, addedIds);
    const removedIds = previousIds.filter((id) => !nextIds.includes(id));
    if (removedIds.length > 0) {
      await this.mediaModel.updateMany(
        { _id: { $in: removedIds.map((id) => new Types.ObjectId(id)) }, ownerId, linkedItemId: itemId },
        { $set: { linkedItemId: null } },
      );
    }
    if (addedIds.length > 0) {
      await this.mediaModel.updateMany(
        { _id: { $in: addedIds.map((id) => new Types.ObjectId(id)) }, ownerId, deletedAt: null },
        { $set: { linkedItemId: itemId } },
      );
    }
  }

  async syncLocationLink(
    ownerId: string,
    locationId: string,
    previousId: string | null,
    nextId: string | null,
  ): Promise<void> {
    if (nextId !== null && nextId !== previousId) await this.validateOwnership(ownerId, [nextId]);
    if (previousId !== null && previousId !== nextId) {
      await this.mediaModel.updateOne(
        { _id: new Types.ObjectId(previousId), linkedLocationId: locationId },
        { $set: { linkedLocationId: null } },
      );
    }
    if (nextId !== null && nextId !== previousId) {
      await this.mediaModel.updateOne(
        { _id: new Types.ObjectId(nextId), ownerId, deletedAt: null },
        { $set: { linkedLocationId: locationId } },
      );
    }
  }

  private async findById(id: string, ownerId?: string): Promise<MediaAssetDocument> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException("图片不存在");
    const filter: Record<string, unknown> = { _id: new Types.ObjectId(id), deletedAt: null };
    if (ownerId !== undefined) filter.ownerId = ownerId;
    const asset = await this.mediaModel.findOne(filter).exec();
    if (!asset) throw new NotFoundException("图片不存在");
    return asset;
  }

  private toSummary(asset: MediaAssetDocument): ImageAssetSummary {
    return {
      id: asset.id,
      originalName: asset.originalName,
      mimeType: asset.mimeType,
      size: asset.size,
      checksumSha256: asset.checksumSha256,
      createdAt: asset.createdAt.toISOString(),
    };
  }

  private detectMimeType(buffer: Buffer): string | null {
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
    if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
    if (buffer.length >= 6 && ["GIF87a", "GIF89a"].includes(buffer.subarray(0, 6).toString("ascii"))) return "image/gif";
    if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
    return null;
  }

  private extensionFor(mimeType: string): string {
    return { "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp" }[mimeType] ?? "bin";
  }
}
