import {DynamoDBClient} from "@aws-sdk/client-dynamodb";
import {
    DynamoDBDocumentClient,
    GetCommand,
    QueryCommand,
    UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

const client = DynamoDBDocumentClient.from(
    new DynamoDBClient({region: process.env.AWS_REGION}),
);

const TABLE_NAME = process.env.TABLE_NAME;
const USER_ID = process.env.DEMO_USER_ID;
const DEPOSIT_CAPS = {daily: 100, weekly: 500, monthly: 1500};

const reply = (data) => ({content: [{type: "text", text: JSON.stringify(data)}]});

export const handler = async(event, context) => {
    // La puerta de enlace envía el nombre como "<destino>___<herramienta>".
    const fullName = context.clientContext?.custom?.bedrockAgentCoreToolName ?? "";
    const tool = fullName.split("___").pop();

    switch(tool){
        case "getTicketStatus":
            return reply(await getTicketStatus(event.ticketId));
        case "getBalance":
            return reply(await getBalance());
        case "setDepositLimit":
            return reply(await setDepositLimit(event.period, event.amount));
        default:
            return reply({error: `Herramienta desconocida: ${fullName}`});
    }
}

async function getTicketStatus(rawTicketId){
    const ticketId = typeof rawTicketId === "number" ? String(rawTicketId) : rawTicketId;
    if(typeof ticketId !== "string" || ticketId.trim() === ""){
        return {error: "Falta el parametro ticketId"};
    }

    const {Item} = await client.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: {userId: USER_ID, sk: `TICKET#${ticketId}`},
    }));
    if(Item){
        return {
            ticketId: Item.ticketId,
            status: Item.status,
            subject: Item.subject,
            createdAt: Item.createdAt,
        };
    }

    const {Items} = await client.send(new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: "ticketId-index",
        KeyConditionExpression: "ticketId = :t",
        ExpressionAttributeValues: {":t": ticketId},
        Limit: 1,
    }));
    if(Items?.length){
        return {error: `El ticket ${ticketId} no pertenece a esta cuenta`};
    }
    return {error: `No existe el ticket ${ticketId}`};
}

async function getBalance(){
    const {Item} = await client.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: {userId: USER_ID, sk: "PROFILE"},
    }));
    if(!Item){
        return {error: "No se encontro el perfil de la cuenta"};
    }
    return {
        balance: Item.balance,
        currency: Item.currency,
        depositLimits: Item.depositLimits,
    };
}

async function setDepositLimit(period, rawAmount){
    if(!(period in DEPOSIT_CAPS)){
        return {error: "Periodo invalido. Usa daily, weekly o monthly"};
    }
    const amount = typeof rawAmount === "string" ? Number(rawAmount) : rawAmount;
    if(typeof amount !== "number" || !Number.isFinite(amount) || amount < 0){
        return {error: "El importe debe ser un numero mayor o igual a 0"};
    }
    if(amount > DEPOSIT_CAPS[period]){
        return {
            error: `El importe supera el tope ${period} de ${DEPOSIT_CAPS[period]} USD. El limite vigente no cambia`,
        };
    }

    const {Attributes} = await client.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: {userId: USER_ID, sk: "PROFILE"},
        UpdateExpression: "SET depositLimits.#p = :a",
        ConditionExpression: "attribute_exists(userId)",
        ExpressionAttributeNames: {"#p": period},
        ExpressionAttributeValues: {":a": amount},
        ReturnValues: "ALL_NEW",
    }));
    return {period, amount, depositLimits: Attributes.depositLimits};
}
