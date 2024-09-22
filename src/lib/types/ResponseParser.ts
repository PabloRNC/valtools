import { GetResponses } from "./GetResponses";

export type ResponseParser<T extends GetResponses> = {
    status: number;
    data: T;
    headers: Headers;
}