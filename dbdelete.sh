aws cognito-idp list-users \
  --user-pool-id us-east-2_hN8Nv2ZW1 \
  --region us-east-2 \
  --query "Users[*].Username" \
  --output text | tr '\t' '\n' | while read username; do
    echo "Deleting Cognito user: $username"
    aws cognito-idp admin-delete-user \
      --user-pool-id us-east-2_hN8Nv2ZW1 \
      --username "$username" \
      --region us-east-2
done

aws dynamodb scan \
  --table-name "User-6bxzhdzyl5hlnmzmp2jjyuq3be-NONE" \
  --region us-east-2 \
  --query "Items[*].id.S" \
  --output text | tr '\t' '\n' | while read id; do
    echo "Deleting DynamoDB user: $id"
    aws dynamodb delete-item \
      --table-name "User-6bxzhdzyl5hlnmzmp2jjyuq3be-NONE" \
      --key "{\"id\": {\"S\": \"$id\"}}" \
      --region us-east-2
done

aws dynamodb scan \
  --table-name "UserSubscription-6bxzhdzyl5hlnmzmp2jjyuq3be-NONE" \
  --region us-east-2 \
  --query "Items[*].id.S" \
  --output text | tr '\t' '\n' | while read id; do
    echo "Deleting DynamoDB subscription: $id"
    aws dynamodb delete-item \
      --table-name "UserSubscription-6bxzhdzyl5hlnmzmp2jjyuq3be-NONE" \
      --key "{\"id\": {\"S\": \"$id\"}}" \
      --region us-east-2
done
