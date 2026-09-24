class SerialNumber {
    public curSerial: number = 0;
    public users: { serial: number; user: string }[] = [];

    constructor(init: number = 0) {
        this.curSerial = init;
    }

    public getNewSerialNumber(user: string = ''): number {
        const newUser = {
            serial: this.curSerial,
            user
        };

        this.users.push(newUser);
        this.curSerial += 1;

        return newUser.serial;
    }
}

export { SerialNumber };
