import { GetResponses } from "./GetResponses";

export type ResponseParser<T extends GetResponses> = {
    data: T;
}