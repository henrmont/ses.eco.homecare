import { User } from "../../core/models/user.model";
import { Professional } from "./professional.model";

export interface HomecareUser extends User {
    professional?: Professional;
}
